/**
 * File: protocol/parser.js
 * Purpose: Implements the 'decode' function, which converts a raw plain text UDP
 * datagram string back into a structured JavaScript message object.
 * * Also includes a utility to quickly parse the header fields for routing.
 * Complies with RFC Section 4 (Message Format and Types).
 */

import { RELIABILITY_FIELDS, MESSAGE_TYPES } from './constants.js';

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
                // This handles complex fields like 'stat_boosts' and 'team_data'
                message[key] = JSON.parse(value);
            } 
            // Check for potential numbers (like sequence_number, damage_dealt, seed)
            else if (!isNaN(Number(value)) && key !== 'message_type') {
                message[key] = Number(value);
            } 
            // Default to string (e.g., move_name, pokemon_name, status_message)
            else {
                message[key] = value;
            }
        } catch (e) {
            // If parsing fails (e.g., corrupted data or a string that looked like an object), keep it as a string
            message[key] = value;
        }
    }

    if (typeof message.message_type === 'undefined') {
        // The message_type field is mandatory for all messages (RFC 4.0).
        throw new Error("Decoded message is missing 'message_type'.");
    }

    return message;
}

/**
 * Extracts the critical header fields (message_type, sequence_number, ack_number) 
 * from the raw packet string to allow quick routing decisions.
 * @param {string} rawData - The raw newline-separated string data from the UDP packet.
 * @returns {Object} An object containing the parsed header information.
 */
export function parseHeader(rawData) {
    const header = {
        message_type: null,
        sequence_number: null,
        ack_number: null,
    };
    
    // Only check the first few lines for efficiency, as header fields are always first.
    const lines = rawData.trim().split('\n').slice(0, 5); 

    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue; 

        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();

        if (key === 'message_type') {
            header.message_type = value;
        } else if (key === RELIABILITY_FIELDS.SEQUENCE_NUMBER) { 
            header.sequence_number = Number(value); 
        } else if (key === RELIABILITY_FIELDS.ACK_NUMBER) {      
            header.ack_number = Number(value); 
        }
    }

    // Throw an error if the mandatory field is missing.
    if (!header.message_type) {
        throw new Error("Cannot parse header: message_type is missing.");
    }

    return header;
}