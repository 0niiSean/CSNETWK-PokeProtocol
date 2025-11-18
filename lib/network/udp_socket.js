// lib/network/udp_socket.js

const dgram = require('dgram');
const Protocol = require('../protocol').default; 
const Logger = require('../utils/logger'); 
const StateMachine = require('../protocol/state_machine');
const BattleEngine = require('../game/battle_engine');
// NOTE: GameState module is required locally inside on('message') due to circular dependency

// --- Global State and Constants ---

let socket = null;
let outboundSequenceNumber = 0;
const SENT_PACKET_BUFFER = new Map(); // Stores outstanding reliable packets

const RETRY_LIMIT = 3;
const RETRANSMISSION_TIMEOUT_MS = 500; // 500ms RTO (per RFC)

// ====================================================================
// SECTION 1: RELIABILITY HELPERS
// ====================================================================

/**
 * Generates the next sequence number and increments the counter.
 * @returns {number} The next sequence number.
 */
function getAndIncrementSeqNum() {
    outboundSequenceNumber += 1;
    return outboundSequenceNumber;
}

/**
 * Handles retransmission timer expiration for a specific packet.
 * Core of the custom reliability layer (ARQ).
 * @param {number} seqNum - The sequence number of the packet that timed out.
 * @returns {void}
 */
function handleTimeout(seqNum) {
    const packet = SENT_PACKET_BUFFER.get(seqNum);

    if (!packet) return;

    if (packet.retryCount >= RETRY_LIMIT) {
        // Max retries reached: Assume connection failure (RFC Requirement).
        Logger.error(
            'NE', 
            `FATAL: Packet #${seqNum} failed to acknowledge after ${RETRY_LIMIT} retries. Connection declared unreliable and closed.`
        );
        closeSocket(); 
        SENT_PACKET_BUFFER.delete(seqNum);
        return;
    }

    // Retransmit the packet
    packet.retryCount += 1;
    Logger.warn(
        'NE', 
        `Retransmitting Packet #${seqNum} (Attempt ${packet.retryCount}/${RETRY_LIMIT}) Type: ${packet.type}`
    );

    // 1. Resend the packet using the raw Buffer data
    socket.send(packet.buffer, packet.remotePort, packet.remoteIP, (err) => {
        if (err) {
            Logger.error('NE', `Error during retransmission of Packet #${seqNum}:`, err);
        } else {
            Logger.verbose('NE', `RE-SENT Packet #${seqNum} successfully.`);
            // 2. Restart the timer for the retransmitted packet
            packet.timer = setTimeout(() => handleTimeout(seqNum), RETRANSMISSION_TIMEOUT_MS);
        }
    });
}

/**
 * Handles incoming ACK messages by clearing the packet buffer.
 * @param {Object} parsedHeader - The header of the incoming ACK message (must contain ack_number).
 * @returns {void}
 */
function handleAck(parsedHeader) {
    const seqNum = parsedHeader.ack_number;
    const packet = SENT_PACKET_BUFFER.get(seqNum);

    if (packet) {
        // Remove the packet and cancel the timer (Confirmed Delivery)
        clearTimeout(packet.timer);
        SENT_PACKET_BUFFER.delete(seqNum);
        Logger.log('NE', `ACK RECEIVED. Confirmed delivery of Peer's Packet #${seqNum}. Buffer size: ${SENT_PACKET_BUFFER.size}`);
    } else {
        Logger.verbose('NE', `Received ACK #${seqNum} for a packet already confirmed/cleared (Duplicate).`);
    }
}


// ====================================================================
// SECTION 2: CORE SEND/RECEIVE MECHANISMS
// ====================================================================

/**
 * Encodes a message, injects the sequence number, and sends it via UDP.
 * Starts the retransmission timer for reliable (non-ACK) packets.
 * @param {Object} messageObject - The message to send.
 * @param {string} remoteIP - The destination IP address.
 * @param {number} remotePort - The destination port.
 * @returns {number} The sequence number of the sent packet.
 */
function sendPacket(messageObject, remoteIP, remotePort) {
    if (!socket) {
        throw new Error("Socket not initialized. Cannot send packet.");
    }
    
    // 1. Inject Sequence Number
    const seqNum = getAndIncrementSeqNum();
    messageObject[Protocol.RELIABILITY_FIELDS.SEQUENCE_NUMBER] = seqNum;

    // 2. Encode and create Buffer
    const encodedPacket = Protocol.encode(messageObject);
    const buffer = Buffer.from(encodedPacket, 'utf8');

    // 3. Track reliable packets and start timer
    if (messageObject.message_type !== Protocol.MESSAGE_TYPES.ACK) {
        const packetData = {
            buffer: buffer,
            remoteIP: remoteIP,
            remotePort: remotePort,
            retryCount: 0,
            type: messageObject.message_type,
            timer: setTimeout(() => handleTimeout(seqNum), RETRANSMISSION_TIMEOUT_MS),
        };
        SENT_PACKET_BUFFER.set(seqNum, packetData);
    }

    // 4. Send the packet
    socket.send(buffer, remotePort, remoteIP, (err) => {
        if (err) {
            Logger.error('NE', `Error sending packet #${seqNum} to ${remoteIP}:${remotePort}:`, err);
        } else {
            Logger.log('NE', `SENT Packet #${seqNum} [Type: ${messageObject.message_type}] to ${remoteIP}:${remotePort}`);
        }
    });

    return seqNum;
}

/**
 * Initializes and binds the UDP socket, setting up the message listener.
 * @param {number} port - The local port to bind to.
 * @param {string} [ip='0.0.0.0'] - The local IP address to bind to.
 * @returns {dgram.Socket} The active UDP socket instance.
 */
function initSocket(port, ip = '0.0.0.0') {
    if (socket) {
        Logger.warn('NE', "UDP Socket already initialized.");
        return socket;
    }

    socket = dgram.createSocket('udp4');

    socket.on('error', (err) => {
        Logger.error('NE', `UDP Socket Error:`, err);
        socket.close(); 
    });

    socket.on('listening', () => {
        const address = socket.address();
        Logger.log('NE', `UDP Socket bound successfully.`);
        Logger.log('NE', `Listening on: ${address.address}:${address.port}`);
    });
    
    socket.on('message', (msg, rinfo) => {
        const remoteIP = rinfo.address;
        const remotePort = rinfo.port;
        const rawPacket = msg.toString('utf8');
        
        const parsedHeader = Protocol.parseHeader(rawPacket);

        Logger.log('NE', `Received Packet #${parsedHeader.sequence_number} from ${remoteIP}:${remotePort}. Type: ${parsedHeader.message_type}`);

        if (parsedHeader.message_type === Protocol.MESSAGE_TYPES.ACK) {
            handleAck(parsedHeader);

        } else {
            // CRITICAL FIX: Ensure GameState is defined in this scope to resolve circular dependency issues.
            const GameState = require('../game/game_state'); 

            // Define wrapper for PA/GM handlers to send a response back
            const sendResponse = (messageObject, remoteIP, remotePort) => {
                sendPacket(messageObject, remoteIP, remotePort);
            };
            
            // --- Handshake/Control Message Routing ---
            if (parsedHeader.message_type.includes('HANDSHAKE') || parsedHeader.message_type === Protocol.MESSAGE_TYPES.DISCONNECT) {
                
                const decodedMessage = Protocol.decode(rawPacket);

                // CRITICAL FIX: Inject IP and Port for State Machine to use
                decodedMessage.remoteIP = remoteIP; 
                decodedMessage.remotePort = remotePort;
                
                StateMachine.handleHandshakePacket(
                    decodedMessage, 
                    StateMachine.peerRole(), 
                    sendResponse
                );

            } 
            // --- Game Message Routing ---
            else {
                
                const ackNumber = parsedHeader.sequence_number;

                // 1. Send ACK immediately (if sequence number is valid)
                if (ackNumber && ackNumber > 0) { 
                    const ackMessage = Protocol.createAckMessage(ackNumber);
                    sendPacket(ackMessage, remoteIP, remotePort); 
                } else {
                    Logger.warn('NE', `Received reliable packet (${parsedHeader.message_type}) with invalid sequence number (${ackNumber}). Cannot acknowledge.`);
                }

                // 2. Decode and route the payload
                try {
                    const decodedMessage = Protocol.decode(rawPacket);
                    
                    const localRole = StateMachine.peerRole().toLowerCase();
                    decodedMessage.remoteIP = remoteIP; 
                    decodedMessage.remotePort = remotePort;

                    switch (decodedMessage.message_type) {
                        case Protocol.MESSAGE_TYPES.BATTLE_SETUP:
                            // CRITICAL TRANSITION: Sets opponent's final team data
                            GameState.handleBattleSetup(decodedMessage, localRole);

                            // CRITICAL TRANSITION: If the local peer is in SETUP_SENT, the exchange is complete.
                            if (StateMachine.getConnectionState() === StateMachine.CONNECTION_STATES.SETUP_SENT) {
                                StateMachine.transitionState(StateMachine.CONNECTION_STATES.CONNECTED);
                                Logger.log('GM-ENGINE', 'Setup complete. Entering WAITING_FOR_MOVE phase (Turn 1).');
                                // Now the user input handlers in host_app/joiner_app should be active!
                            }

                            // NOTE: Peer transitions to CONNECTED state outside this function once both SETUPs are received/processed.
                            break;
                        case Protocol.MESSAGE_TYPES.ATTACK_ANNOUNCE:
                            BattleEngine.handleAttackAnnounce(decodedMessage, localRole, remoteIP, remotePort);
                            break;
                        case Protocol.MESSAGE_TYPES.DEFENSE_ANNOUNCE:
                            BattleEngine.handleDefenseAnnounce(decodedMessage, localRole, remoteIP, remotePort);
                            break;
                        case Protocol.MESSAGE_TYPES.CALCULATION_REPORT: 
                            BattleEngine.handleCalculationReport(decodedMessage, localRole, remoteIP, remotePort);
                            break;
                        case Protocol.MESSAGE_TYPES.CALCULATION_CONFIRM:
                            BattleEngine.handleCalculationConfirm(decodedMessage, localRole, remoteIP, remotePort);
                            break;
                        case Protocol.MESSAGE_TYPES.RESOLUTION_REQUEST:
                            // TODO: Implement handleResolutionRequest in BattleEngine
                            Logger.warn('NE', 'Received RESOLUTION_REQUEST. GM Handler not implemented.');
                            break;
                            
                        default:
                            Logger.warn('NE', `Unhandled Game Message Type: ${decodedMessage.message_type}`);
                    }
                    
                } catch (e) {
                    Logger.error('NE', `Failed to fully decode message or route:`, e); 
                }
            }
        }
    });
    
    try {
        socket.bind(port, ip);
    } catch (e) {
        Logger.error('NE', `Failed to bind socket to port ${port}: ${e.message}`, e);
        throw e;
    }

    return socket;
}


// ====================================================================
// SECTION 3: PUBLIC EXPORTS
// ====================================================================

/**
 * Returns the currently active socket instance.
 * @returns {dgram.Socket} The active socket.
 * @throws {Error} If the socket has not been initialized.
 */
function getSocket() {
    if (!socket) {
        throw new Error("UDP Socket has not been initialized. Call initSocket() first.");
    }
    return socket;
}

/**
 * Closes the socket cleanly and clears all pending retransmission timers.
 * @returns {void}
 */
function closeSocket() {
    if (socket) {
        // Clear all pending timers before closing the socket
        for (const packet of SENT_PACKET_BUFFER.values()) {
            clearTimeout(packet.timer);
        }
        SENT_PACKET_BUFFER.clear();
        
        socket.close();
        socket = null;
        Logger.log("NE", "UDP Socket closed.");
    }
}

module.exports = {
    initSocket,
    getSocket,
    closeSocket,
    sendPacket, 
    getAndIncrementSeqNum, // Exposed mainly for testing/debug
    handleAck,
};