/**
 * File: protocol/serializer.js
 * Purpose: Implements the 'encode' function, which converts a structured JavaScript
 * message object into the PokeProtocol's required plain text, newline-separated
 * key:value format for sending over UDP.
 * * Complies with RFC Section 4 (Message Format and Types).
 */

import { RELIABILITY_FIELDS, MESSAGE_TYPES } from './constants.js';

/**
 * Encodes a JavaScript message object into the PokeProtocol's 
 * newline-separated key: value plain text format.
 * * The format must be:
 * message_type: VALUE
 * sequence_number: VALUE (if not ACK)
 * ack_number: VALUE (if present)
 * other_key: other_value
 * * @param {Object} message - The message object to encode.
 * @returns {string} The encoded plain text message ready for transmission.
 */
export function encode(message) {
    if (!message || typeof message.message_type === 'undefined') {
        throw new Error("Message object must contain a 'message_type'.");
    }

    let encodedMessage = '';
    
    // Define the local key names using constants for robustness
    const sequenceNumberKey = RELIABILITY_FIELDS.SEQUENCE_NUMBER; 
    const ackNumberKey = RELIABILITY_FIELDS.ACK_NUMBER;
    
    // 1. Write mandatory 'message_type' first (CRITICAL for header parsing).
    encodedMessage += `message_type: ${message.message_type}\n`;
    
    // 2. Write sequence_number if present (mandatory for non-ACK messages).
    // Note: ACK messages do not carry a sequence_number of their own.
    if (message[sequenceNumberKey] && message.message_type !== MESSAGE_TYPES.ACK) {
        encodedMessage += `${sequenceNumberKey}: ${message[sequenceNumberKey]}\n`;
    }
    
    // 3. Write ack_number if present (mandatory for ACK messages, optional for others).
    if (message[ackNumberKey]) {
        encodedMessage += `${ackNumberKey}: ${message[ackNumberKey]}\n`;
    }
    
    // 4. Iterate over remaining properties and serialize
    for (const key in message) {
        if (Object.prototype.hasOwnProperty.call(message, key)) {
            
            // Skip keys already written in the header (1, 2, or 3)
            if (key === 'message_type' || key === sequenceNumberKey || key === ackNumberKey) {
                continue;
            }

            const value = message[key];
            let serializedValue;

            // Handle complex types (Objects/Arrays) by JSON stringifying them.
            // This is necessary for fields like 'stat_boosts'.
            if (typeof value === 'object' && value !== null) {
                serializedValue = JSON.stringify(value);
            } else {
                // All other values (string/number/boolean) are serialized to their string representation.
                serializedValue = String(value);
            }
            
            // Append the key: value pair to the message
            encodedMessage += `${key}: ${serializedValue}\n`;
        }
    }

    // Return the final message string, trimming trailing newlines.
    return encodedMessage.trim(); 
}