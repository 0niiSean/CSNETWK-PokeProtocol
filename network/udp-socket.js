/**
 * File: network/udp-socket.js
 * Purpose: Handles raw UDP socket creation and management. It serves as the low-level 
 * transport bridge, providing the raw packet send function to the Reliability layer and
 * routing validated, acknowledged application messages to the high-level router.
 */

import dgram from 'dgram';
// Protocol Layer Imports
import * as Parser from '../protocol/parser.js'; // Imports decode, parseHeader
import * as Serializer from '../protocol/serializer.js'; // Imports encode
import { MESSAGE_TYPES, RELIABILITY_FIELDS } from '../protocol/constants.js';

// Network Layer Imports
import * as Reliability from './reliability.js';

// Assuming the Logger utility is available in utils/
import * as Logger from '../utils/logger.js'; 

let socket = null;
let routerCallback = null; 

// ====================================================================
// SECTION 1: RAW SEND/RECEIVE MECHANISMS (Used by Reliability Layer)
// ====================================================================

/**
 * Logs the full, raw RFC-compliant message payload to the console.
 */
function logPayload(message, encodedData) {
    if (message.message_type === MESSAGE_TYPES.HANDSHAKE_REQUEST) {
        Logger.log('Client', `--- SENT MESSAGE (RFC 4.1) ---`);
        console.log(`message_type: ${message.message_type}\n`);
    } else {
        // Fallback for logging other simple messages
        Logger.log('Client', `--- SENT MESSAGE PAYLOAD ---`);
        console.log(encodedData);
    }
}


/**
 * Sends a raw packet (encoded string) over the UDP socket.
 * * CRITICAL: This function is the direct interface to the network hardware and is linked 
 * to the Reliability layer via initializeSender().
 * @param {Object} message - The decoded message object (to be encoded here).
 * @param {string} ip - Destination IP address.
 * @param {number} port - Destination port.
 */
function sendRawPacket(message, ip, port) {
    if (!socket) {
        Logger.error("UDP", "Socket not initialized. Cannot send raw packet.");
        return;
    }
    
    try {
        // FIX: Ensure Serializer is called correctly.
        const encodedData = Serializer.encode(message); 
        const buffer = Buffer.from(encodedData, 'utf8');

        // Log the payload content only once, before transmission
        logPayload(message, encodedData); 
        
        const logId = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER] || message[RELIABILITY_FIELDS.ACK_NUMBER] || 'N/A';
        const logType = (message.message_type === MESSAGE_TYPES.ACK) ? 'ACK' : 'Data';

        socket.send(buffer, port, ip, (err) => {
            if (err) {
                Logger.error(`UDP Send Error for ${logType} packet: ${err}`);
            } else {
                Logger.log('UDP', `[${logType}] Sent: ${message.message_type} (ID: ${logId}) to ${ip}:${port}`);
            }
        });
    } catch (e) {
        Logger.error(`Serialization Error for ${message.message_type}: ${e.message}`);
    }
}

/**
 * Main packet handler for all incoming data.
 * This function handles reliability checks before passing to the application layer.
 * @param {string} rawData - The raw incoming string data.
 * @param {Object} rinfo - Remote address information (IP and Port).
 */
function handleIncomingPacket(rawData, rinfo) {
    let message;

    try {
        // 1. Fast Header Parse: Used to quickly identify message type and reliability fields
        const header = Parser.parseHeader(rawData);
        
        // 2. ACK Routing: Handle ACK messages instantly (control packets).
        if (header.message_type === MESSAGE_TYPES.ACK) {
            Reliability.handleAck(header[RELIABILITY_FIELDS.ACK_NUMBER]);
            return; // Stop processing ACK control packets
        }

        // 3. Full Decode: Only decode application messages.
        message = Parser.decode(rawData);
        
        // 4. ACK Back: If the message has a sequence number (i.e., is reliable), send an ACK back immediately.
        const seqNum = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER];
        if (seqNum) {
            // CRITICAL: Reliability layer sends the ACK control packet immediately.
            Reliability.sendAck(seqNum, rinfo.address, rinfo.port);
        }

        // Add source info before routing to application
        message.remoteIP = rinfo.address;
        message.remotePort = rinfo.port;
        
        // 5. ROUTE TO APPLICATION: Send the reliable application message to the higher-level router.
        if (routerCallback) {
            routerCallback(message);
        }

    } catch (e) {
        Logger.error('UDP', `Packet Handling Failure from ${rinfo.address}:${rinfo.port}. Error: ${e.message}. Raw Data: ${rawData.substring(0, 50)}...`);
    }
}

// ====================================================================
// SECTION 2: PUBLIC SOCKET MANAGEMENT
// ====================================================================

/**
 * Initializes the UDP socket and sets up the routing logic.
 * @param {number} port - The local port to listen on.
 * @param {function} appRouterCallback - Function (message) => {...} to route application-level messages (p2p-server.js or p2p-client.js).
 */
export function initializeSocket(port, appRouterCallback) {
    if (socket) {
        Logger.warn('UDP', "UDP Socket already initialized.");
        return;
    }
    
    routerCallback = appRouterCallback;
    socket = dgram.createSocket('udp4');

    // CRITICAL: Link the raw sender function to the Reliability module
    Reliability.initializeSender(sendRawPacket);

    socket.on('error', (err) => {
        Logger.error('UDP', `Socket Error: ${err.stack}`);
        socket.close();
    });

    socket.on('message', (msg, rinfo) => {
        handleIncomingPacket(msg.toString('utf8'), rinfo);
    });

    socket.on('listening', () => {
        const address = socket.address();
        Logger.log('UDP', `Socket listening on ${address.address}:${address.port}`);
    });

    socket.bind(port);
}

export function closeSocket() {
    if (socket) {
        socket.close();
        socket = null;
        Logger.log('UDP', 'Socket closed.');
    }
}