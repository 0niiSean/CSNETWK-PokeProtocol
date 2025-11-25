/**
 * File: network/reliability.js
 * Purpose: Implements the custom reliability layer for PokeProtocol over UDP (RFC 5.1).
 * This module manages sequence numbers, the retransmission buffer, and timeout/retry logic.
 * Guarantees delivery by retransmitting unacknowledged packets.
 */

import { RELIABILITY_FIELDS, RELIABILITY_CONFIG, MESSAGE_TYPES } from '../protocol/constants.js';
import { createAckMessage } from '../protocol/message-creators.js';
// Assuming a Logger utility is available in utils/
import * as Logger from '../utils/logger.js'; 

// --- STATE ---
let sequenceCounter = 1;
// retransmissionBuffer maps sequenceNumber -> { message, ip, port, retries, timer }
const retransmissionBuffer = new Map(); 

// --- Configuration (from constants.js) ---
const TIMEOUT_MS = RELIABILITY_CONFIG.TIMEOUT_MS; // 500ms (RFC requirement)
const MAX_RETRIES = RELIABILITY_CONFIG.MAX_RETRIES; // 3 (RFC requirement)

// --- External Dependency Placeholder (Provided by udp-socket.js) ---
let sendRawPacketExternal = null;

/**
 * Initializes the external raw packet sender function.
 * @param {function} sendFunc - The function from udp-socket.js to send the raw packet buffer.
 */
export function initializeSender(sendFunc) {
    sendRawPacketExternal = sendFunc;
}

/**
 * Gets the next unique sequence number for an outgoing message.
 * @returns {number} The next sequence number.
 */
export function getNextSequenceNumber() {
    return sequenceCounter++;
}

/**
 * Schedules a message for reliable sending and starts its retransmission timer.
 * @param {Object} message - The message object to send (must contain sequence_number).
 * @param {string} ip - Opponent IP address.
 * @param {number} port - Opponent port.
 */
export function sendReliable(message, ip, port) {
    if (!sendRawPacketExternal) {
        throw new Error("Reliability sender not initialized.");
    }
    const seqNum = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER];

    if (retransmissionBuffer.has(seqNum)) {
        Logger.warn(`[Reliability] Packet ${seqNum} already buffered.`);
        return;
    }

    const retransmit = () => {
        const entry = retransmissionBuffer.get(seqNum);

        if (!entry) {
            // Packet acknowledged and cleared. Stop timer.
            return;
        }

        // --- RFC 5.1: Max Retries Check ---
        if (entry.retries >= MAX_RETRIES) {
            Logger.error(`[Reliability] FATAL: Packet ${seqNum} failed after ${MAX_RETRIES} retries. Connection declared unreliable (RFC 5.1).`);
            // CRITICAL: A failure event should be sent to the Game State Machine here.
            retransmissionBuffer.delete(seqNum);
            return;
        }

        // Retransmit the packet and increment retry counter
        sendRawPacketExternal(entry.message, entry.ip, entry.port);
        entry.retries++;
        Logger.log(`[Reliability] Retransmitting packet ${seqNum} (Attempt ${entry.retries}/${MAX_RETRIES}).`);

        // Restart timer for the next retry
        entry.timer = setTimeout(retransmit, TIMEOUT_MS);
    };

    // 1. Send the first instance immediately
    sendRawPacketExternal(message, ip, port);
    
    // 2. Buffer the message and set the first timeout
    const entry = { 
        message, 
        ip, 
        port, 
        retries: 0, 
        timer: setTimeout(retransmit, TIMEOUT_MS) 
    };
    retransmissionBuffer.set(seqNum, entry);
}

/**
 * Processes an incoming ACK number, clearing the message from the retransmission buffer.
 * @param {number} ackNum - The sequence number being acknowledged.
 * @returns {boolean} True if a packet was successfully cleared.
 */
export function handleAck(ackNum) {
    if (retransmissionBuffer.has(ackNum)) {
        clearTimeout(retransmissionBuffer.get(ackNum).timer);
        retransmissionBuffer.delete(ackNum);
        Logger.log(`[Reliability] Acknowledged and cleared packet ${ackNum}.`);
        return true;
    }
    return false; 
}

/**
 * Generates and sends an ACK message in response to a received message.
 * * ACKs are fire-and-forget (unreliable) control packets.
 * @param {number} seqNumToAck - The sequence number of the received message.
 * @param {string} ip - Sender's IP address.
 * @param {number} port - Sender's port.
 */
export function sendAck(seqNumToAck, ip, port) {
    if (!sendRawPacketExternal) {
        throw new Error("Reliability sender not initialized.");
    }
    const ackMessage = createAckMessage(seqNumToAck);
    // CRITICAL: ACKs do NOT use sendReliable; they use the raw sender directly.
    sendRawPacketExternal(ackMessage, ip, port);
}

/**
 * Checks if a received message is an ACK type.
 * @param {Object} message - The decoded message object.
 * @returns {boolean}
 */
export function isAckMessage(message) {
    return message.message_type === MESSAGE_TYPES.ACK;
}