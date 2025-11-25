/**
 * File: protocol/constants.js
 * * Purpose: Defines all constant string literals for message types, field names,
 * and configuration values used across the application.
 * * Usage: This file is imported by:
 * - protocol/* (for message structuring and serialization/parsing)
 * - network/* (for reliability fields and retransmission logic)
 * - game/* (for message handling and state machine logic)
 * - utils/* (for shared helper configurations)
 */

// --- 1. CORE MESSAGE TYPES (RFC Section 4.1 - 4.11) ---

/**
 * @typedef {Object} MESSAGE_TYPES
 * Defines the value of the mandatory 'message_type' field for all packets.
 * These strings MUST match the RFC exactly for interpretation by the remote peer.
 */
export const MESSAGE_TYPES = {
    // Handshake & Connection Management
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST', // RFC 4.1
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE', // RFC 4.2
    SPECTATOR_REQUEST: 'SPECTATOR_REQUEST', // RFC 4.3
    BATTLE_SETUP: 'BATTLE_SETUP', // RFC 4.4

    // Turn Handshake (RFC 5.2 - Steps 2 & 3)
    ATTACK_ANNOUNCE: 'ATTACK_ANNOUNCE', // RFC 4.5
    DEFENSE_ANNOUNCE: 'DEFENSE_ANNOUNCE', // RFC 4.6
    CALCULATION_REPORT: 'CALCULATION_REPORT', // RFC 4.7
    CALCULATION_CONFIRM: 'CALCULATION_CONFIRM', // RFC 4.8
    RESOLUTION_REQUEST: 'RESOLUTION_REQUEST', // RFC 4.9

    // Final & Asynchronous
    GAME_OVER: 'GAME_OVER', // RFC 4.10
    CHAT_MESSAGE: 'CHAT_MESSAGE', // RFC 4.11
    
    // Custom Protocol Overhead (Reliability Layer)
    ACK: 'ACK', 
};

// --- 2. RELIABILITY FIELDS (RFC Section 5.1) ---

/**
 * @typedef {Object} RELIABILITY_FIELDS
 * Fields related to the custom reliability layer.
 */
export const RELIABILITY_FIELDS = {
    SEQUENCE_NUMBER: 'sequence_number', // Mandatory for all non-ACK messages.
    ACK_NUMBER: 'ack_number',           // Sent by the peer to acknowledge receipt.
};

// --- 3. BATTLE-SPECIFIC FIELDS (RFC Section 4.4, 4.7, 4.11) ---

/**
 * @typedef {Object} BATTLE_FIELDS
 * Fields specific to battle logic and data transfer messages.
 */
export const BATTLE_FIELDS = {
    // Handshake & Setup (BATTLE_SETUP)
    SEED: 'seed',                       // Sent in HANDSHAKE_RESPONSE for RNG sync.
    COMMUNICATION_MODE: 'communication_mode', // 'P2P' or 'BROADCAST'.
    POKEMON_NAME: 'pokemon_name',       // Name of the peer's chosen Pokémon.
    STAT_BOOSTS: 'stat_boosts',         // Object containing allocated boost uses.

    // Turn Announcement (ATTACK_ANNOUNCE)
    MOVE_NAME: 'move_name',             // Name of the chosen attack.

    // Calculation Report & Resolution (CALCULATION_REPORT / RESOLUTION_REQUEST)
    ATTACKER: 'attacker',
    MOVE_USED: 'move_used',
    REMAINING_HEALTH: 'remaining_health',
    DAMAGE_DEALT: 'damage_dealt',
    DEFENDER_HP_REMAINING: 'defender_hp_remaining',
    STATUS_MESSAGE: 'status_message',   // Descriptive string for the turn.

    // Game Over
    WINNER: 'winner',
    LOSER: 'loser',
    
    // Chat Message (CHAT_MESSAGE)
    SENDER_NAME: 'sender_name',
    CONTENT_TYPE: 'content_type',       // 'TEXT' or 'STICKER'.
    MESSAGE_TEXT: 'message_text',       // Used when CONTENT_TYPE is 'TEXT'.
    STICKER_DATA: 'sticker_data',       // Used when CONTENT_TYPE is 'STICKER'.
};

// --- 4. RELIABILITY CONFIGURATION (Used by reliability.js) ---

/**
 * @typedef {Object} RELIABILITY_CONFIG
 * Configuration values for the custom reliability layer (RFC 5.1).
 */
export const RELIABILITY_CONFIG = {
    TIMEOUT_MS: 500,                    // Recommended timeout is 500 milliseconds.
    MAX_RETRIES: 3,                     // Recommended maximum number of retries is 3.
};