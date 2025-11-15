// lib/network/udp_socket.js

const dgram = require('dgram');
const Protocol = require('../protocol').default; 
const Logger = require('../utils/logger'); 
const StateMachine = require('../protocol/state_machine');

let socket = null;
let outboundSequenceNumber = 0;

const SENT_PACKET_BUFFER = new Map();

// CONSTANTS for Retransmission Logic
const RETRY_LIMIT = 3;
const RETRANSMISSION_TIMEOUT_MS = 500; // 500ms RTO

// --- Private Helpers for Reliability ---

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
 * This is the core of the reliability layer.
 * @param {number} seqNum - The sequence number of the packet that timed out.
 */
function handleTimeout(seqNum) {
    const packet = SENT_PACKET_BUFFER.get(seqNum);

    if (!packet) {
        // This should not happen if the ACK handler is working correctly.
        return;
    }

    if (packet.retryCount >= RETRY_LIMIT) {
        // Max retries reached: Declare connection failure.
        Logger.error(
            'NE', 
            `FATAL: Packet #${seqNum} failed to acknowledge after ${RETRY_LIMIT} retries. Connection declared unreliable and closed.`
        );
        // CRITICAL CHECKLIST ITEM: Close the socket to declare failure
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
 * Handles incoming ACK messages.
 * CRITICAL UPDATE: Removes the acknowledged packet from the Buffer and stops its timer.
 * @param {Object} parsedHeader - The header of the incoming ACK message.
 */
function handleAck(parsedHeader) {
    const seqNum = parsedHeader.ack_number;
    const packet = SENT_PACKET_BUFFER.get(seqNum);

    if (packet) {
        // CHECKLIST ITEM: Remove the packet and cancel the timer
        clearTimeout(packet.timer);
        SENT_PACKET_BUFFER.delete(seqNum);
        Logger.log('NE', `ACK RECEIVED. Confirmed delivery of Peer's Packet #${seqNum}. Buffer size: ${SENT_PACKET_BUFFER.size}`);
    } else {
        // This happens if we receive an ACK for a packet we already acknowledged (duplicate ACK)
        Logger.verbose('NE', `Received ACK #${seqNum} for a packet already confirmed/cleared.`);
    }
}


// --- Core NE Functionality ---

/**
 * CRITICAL UPDATE: Encodes, sends, stores in buffer, and starts the timer.
 * @param {Object} messageObject - The message to send.
 * @param {string} remoteIP - The destination IP address.
 * @param {number} remotePort - The destination port.
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

    // 3. CRITICAL FIX: Only track and set timer for reliable packets (non-ACK)
    if (messageObject.message_type !== Protocol.MESSAGE_TYPES.ACK) {
        const packetData = {
            buffer: buffer,
            remoteIP: remoteIP,
            remotePort: remotePort,
            retryCount: 0,
            type: messageObject.message_type,
            // Start the retransmission timer
            timer: setTimeout(() => handleTimeout(seqNum), RETRANSMISSION_TIMEOUT_MS),
        };

        // CHECKLIST ITEM: Implement the Packet Buffer data structure
        SENT_PACKET_BUFFER.set(seqNum, packetData);
    }
    // End of conditional storage

    // 4. Send the packet
    socket.send(buffer, remotePort, remoteIP, (err) => {
        if (err) {
            Logger.error('NE', `Error sending packet #${seqNum} to ${remoteIP}:${remotePort}:`, err);
        } else {
            Logger.log('NE', `SENT Packet #${seqNum} [Type: ${messageObject.message_type}] to ${remoteIP}:${remotePort}`);
            Logger.verbose('NE', `Raw Data Sent: ${encodedPacket.substring(0, 100)}...`); 
        }
    });

    return seqNum;
}


// --- Socket Initialization (Remains the same as previous) ---

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
        Logger.verbose('NE', `Raw Data Received: ${rawPacket.substring(0, 100)}...`);

        if (parsedHeader.message_type === Protocol.MESSAGE_TYPES.ACK) {
            handleAck(parsedHeader);

        } else {
            // Generate a NE send function wrapper for the PA handler to use.
            const sendResponse = (messageObject, remoteIP, remotePort) => {
                sendPacket(messageObject, remoteIP, remotePort);
            };
            
            // Check if this is a Handshake packet and route it
        if (parsedHeader.message_type.includes('HANDSHAKE') || parsedHeader.message_type === Protocol.MESSAGE_TYPES.DISCONNECT) {
            
            // CRITICAL PA LOGIC CALL: Decode the full message before routing
            const decodedMessage = Protocol.decode(rawPacket);
            
            StateMachine.handleHandshakePacket(
                decodedMessage, 
                StateMachine.peerRole(), 
                sendResponse
            );

        } else {
                // Case B: RECEIVED a reliable, non-ACK packet.
                
                // Generate and Send ACK back 
                const ackMessage = Protocol.createAckMessage(parsedHeader.sequence_number);
                sendPacket(ackMessage, remoteIP, remotePort); 

                // Decode and pass the full message payload
                try {
                    const decodedMessage = Protocol.decode(rawPacket);
                    Logger.log('NE', `Full Decoded Payload: ${decodedMessage.message_type} (Seq: ${decodedMessage.sequence_number})`);
                    // FUTURE: Pass decodedMessage to the main state machine handler
                } catch (e) {
                    Logger.error('NE', `Failed to fully decode message:`, e); 
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


// --- Public Interface (Keep the rest of the file) ---

/**
 * Returns the currently active socket instance.
 */
function getSocket() {
    if (!socket) {
        throw new Error("UDP Socket has not been initialized. Call initSocket() first.");
    }
    return socket;
}

/**
 * Closes the socket cleanly.
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
    getAndIncrementSeqNum,
};