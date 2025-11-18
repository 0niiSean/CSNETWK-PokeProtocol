// --- In lib/protocol/serializer.js ---

import { MESSAGE_TYPES, HANDSHAKE_FIELDS, RELIABILITY_FIELDS } from './constants.js';

/**
 * Encodes a JavaScript message object into the PokeProtocol's 
 * newline-separated key: value plain text format.
 * @param {Object} message - The message object to encode.
 * @returns {string} The encoded plain text message.
 */
export function encode(message) {
    if (!message || typeof message.message_type === 'undefined') {
        throw new Error("Message object must contain a 'message_type'.");
    }

    let encodedMessage = '';
    
    // Define the local key name for the sequence number
    const sequenceNumberKey = RELIABILITY_FIELDS.SEQUENCE_NUMBER; 
    
    // 1. Write essential header fields first (CRITICAL for parseHeader to work)
    encodedMessage += `message_type: ${message.message_type}\n`;
    
    if (message[sequenceNumberKey]) {
        encodedMessage += `${sequenceNumberKey}: ${message[sequenceNumberKey]}\n`;
    }
    
    // 2. Iterate over remaining properties
    for (const key in message) {
        if (Object.prototype.hasOwnProperty.call(message, key)) {
            
            // CRITICAL FINAL FIX: Skip keys already written
            if (key === 'message_type' || key === sequenceNumberKey) {
                continue;
            }

            const value = message[key];
            let serializedValue;

            if (typeof value === 'object' && value !== null) {
                serializedValue = JSON.stringify(value);
            } else {
                serializedValue = String(value);
            }
            
            encodedMessage += `${key}: ${serializedValue}\n`;
        }
    }

    return encodedMessage.trim(); 
}

// ... (Rest of the file remains the same)

/**
 * Decodes the PokeProtocol's plain text format into a JavaScript object.
 * @param {string} rawData - The raw newline-separated string data from the UDP packet.
 * @returns {Object} The decoded message object.
 */
export function decode(rawData) {
    const message = {};
    const lines = rawData.trim().split('\n');

    for (const line of lines) {
        // Find the first colon to separate key from value
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue; 

        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();

        // Attempt to parse known JSON/numeric types back from strings
        try {
            // Check for potential objects/arrays (starts with { or [)
            if (value.startsWith('{') || value.startsWith('[')) {
                message[key] = JSON.parse(value);
            } 
            // Check for potential numbers (like sequence_number)
            else if (!isNaN(Number(value)) && key !== 'message_type') {
                message[key] = Number(value);
            } 
            // Default to string
            else {
                message[key] = value;
            }
        } catch (e) {
            // If JSON parsing fails, treat it as a string
            message[key] = value;
        }
    }

    if (typeof message.message_type === 'undefined') {
        throw new Error("Decoded message is missing 'message_type'.");
    }

    return message;
}