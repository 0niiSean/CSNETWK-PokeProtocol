// lib/protocol/constants.js

export const MESSAGE_TYPES = {
    // Handshake and Setup
    HANDSHAKE_REQUEST: "HANDSHAKE_REQUEST",
    HANDSHAKE_RESPONSE: "HANDSHAKE_RESPONSE",
    SPECTATOR_REQUEST: "SPECTATOR_REQUEST", 
    BATTLE_SETUP: "BATTLE_SETUP",
    // Acknowledgment Message for Reliability
    ACK: "ACK", 
    SPECTATOR_REQUEST: "SPECTATOR_REQUEST", 
    BATTLE_SETUP: "BATTLE_SETUP",
    // Turn Flow
    ATTACK_ANNOUNCE: "ATTACK_ANNOUNCE",
    DEFENSE_ANNOUNCE: "DEFENSE_ANNOUNCE",
    CALCULATION_REPORT: "CALCULATION_REPORT",
    CALCULATION_CONFIRM: "CALCULATION_CONFIRM",
    // Error/Ending
    RESOLUTION_REQUEST: "RESOLUTION_REQUEST",
    GAME_OVER: "GAME_OVER",
    // Chat (Asynchronous)
    CHAT_MESSAGE: "CHAT_MESSAGE",
};

// NEW: Fields used across the reliability layer (NE's domain)
export const RELIABILITY_FIELDS = {
    SEQUENCE_NUMBER: 'sequence_number', // Field required on every reliable packet
    ACK_NUMBER: 'ack_number',         // Field for the ACK message payload
};

export const HANDSHAKE_FIELDS = {
    // Shared between INIT and RESP
    SEQUENCE_NUMBER: 'sequence_number',
    PEER_ID: 'peer_id',
    // Specific to the initial request (INIT)
    SEED: 'seed', 
    TEAM_PREVIEW: 'team_preview', // A placeholder for the 3-pokemon team names
    // Specific to the final response (RESP)
    TIMESTAMP: 'timestamp',
};