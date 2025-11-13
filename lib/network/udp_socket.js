// lib/network/udp_socket.js

const dgram = require('dgram');
// Imports the completed Protocol Architect module for encoding/decoding/constants
const Protocol = require('../protocol').default; 

let socket = null;
let outboundSequenceNumber = 0; // State variable to track all packets sent by this peer

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
 * Handles incoming ACK messages.
 * In Week 10, this is just a logging function. 
 * In Week 11, it will implement logic to remove packets from the Retransmission Buffer.
 * @param {Object} parsedHeader - The header of the incoming ACK message.
 */
function handleAck(parsedHeader) {
    console.log(`[NE] ACK RECEIVED. Confirming delivery of Peer's Packet #${parsedHeader.ack_number}`);
}


// --- Core NE Functionality ---

/**
 * CRITICAL DELIVERABLE: Encodes and sends a structured message object over the UDP socket.
 * Injects the current sequence number before encoding.
 * @param {Object} messageObject - The message (e.g., HANDSHAKE_REQUEST) to send.
 * @param {string} remoteIP - The destination IP address.
 * @param {number} remotePort - The destination port.
 */
function sendPacket(messageObject, remoteIP, remotePort) {
    if (!socket) {
        throw new Error("Socket not initialized. Cannot send packet.");
    }
    
    // 1. Inject Sequence Number (uses the PA's defined field name)
    const seqNum = getAndIncrementSeqNum();
    messageObject[Protocol.RELIABILITY_FIELDS.SEQUENCE_NUMBER] = seqNum;

    // 2. Encode the Message Object into a network string (using PA's logic)
    const encodedPacket = Protocol.encode(messageObject);
    const buffer = Buffer.from(encodedPacket, 'utf8');

    // 3. Send the packet
    socket.send(buffer, remotePort, remoteIP, (err) => {
        if (err) {
            console.error(`[NE] Error sending packet #${seqNum} to ${remoteIP}:${remotePort}:`, err.stack);
        } else {
            console.log(`[NE] SENT Packet #${seqNum} [Type: ${messageObject.message_type}] to ${remoteIP}:${remotePort}`);
        }
    });

    return seqNum;
}


/**
 * Initializes and binds the UDP socket for listening and sending.
 * Implements the P2P ACK logic within the message handler.
 * @param {number} port - The local port number to bind to.
 * @param {string} [ip='0.0.0.0'] - The local IP address to bind to.
 */
function initSocket(port, ip = '0.0.0.0') {
    if (socket) {
        console.warn("UDP Socket already initialized.");
        return socket;
    }

    // 1. Create the socket instance
    socket = dgram.createSocket('udp4');

    // --- Error & Status Handlers ---
    socket.on('error', (err) => {
        console.error(`[NE] UDP Socket Error:\n${err.stack}`);
        socket.close(); 
    });

    socket.on('listening', () => {
        const address = socket.address();
        console.log(`[NE] UDP Socket bound successfully.`);
        console.log(`\tListening on: ${address.address}:${address.port}`);
    });
    
    // --- REFRACTORED on('message') Handler (ACK Logic) ---
    socket.on('message', (msg, rinfo) => {
        const remoteIP = rinfo.address;
        const remotePort = rinfo.port;
        const rawPacket = msg.toString('utf8');
        
        // 1. CRITICAL: Use PA's utility for fast header check
        const parsedHeader = Protocol.parseHeader(rawPacket);

        // 2. Log Packet Type
        console.log(`[NE] Received Packet #${parsedHeader.sequence_number} from ${remoteIP}:${remotePort}. Type: ${parsedHeader.message_type}`);
        
        if (parsedHeader.message_type === Protocol.MESSAGE_TYPES.ACK) {
            // Case A: RECEIVED an ACK. Handle confirmation.
            handleAck(parsedHeader);
            
        } else {
            // Case B: RECEIVED a reliable, non-ACK packet (HANDSHAKE, DATA, etc.).
            
            // 3. Generate and Send ACK back (This implements the "reliable receipt" logic)
            const ackMessage = Protocol.createAckMessage(parsedHeader.sequence_number);
            sendPacket(ackMessage, remoteIP, remotePort);

            // 4. Decode the full message payload for the Game Master / State Machine.
            try {
                const decodedMessage = Protocol.decode(rawPacket);
                console.log(`[NE] Full Decoded Payload: ${decodedMessage.message_type} (Seq: ${decodedMessage.sequence_number})`);
                // FUTURE: Pass decodedMessage to the main state machine handler
            } catch (e) {
                console.error(`[NE] Failed to fully decode message: ${e.message}`);
            }
        }
    });
    
    // 2. Bind the socket
    try {
        socket.bind(port, ip);
    } catch (e) {
        console.error(`[NE] Failed to bind socket to port ${port}: ${e.message}`);
        throw e;
    }

    return socket;
}


// --- Public Interface ---

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
        socket.close();
        socket = null;
        console.log("[NE] UDP Socket closed.");
    }
}


module.exports = {
    initSocket,
    getSocket,
    closeSocket,
    sendPacket,        
    getAndIncrementSeqNum,
};