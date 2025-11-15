// lib/protocol/constants.js

export const MESSAGE_TYPES = {
    // Handshake and Setup
    HANDSHAKE_REQUEST: "HANDSHAKE_REQUEST",
    HANDSHAKE_RESPONSE: "HANDSHAKE_RESPONSE",
    SPECTATOR_REQUEST: "SPECTATOR_REQUEST", 
    BATTLE_SETUP: "BATTLE_SETUP",
    ACK: "ACK", 
    
    // Turn Synchronization Messages 
    ATTACK_ANNOUNCE: "ATTACK_ANNOUNCE", 
    DEFENSE_ANNOUNCE: "DEFENSE_ANNOUNCE", 
    CALCULATION_REPORT: "CALCULATION_REPORT", 
    CALCULATION_CONFIRM: "CALCULATION_CONFIRM", 
    RESOLUTION_REQUEST: "RESOLUTION_REQUEST", 
    GAME_OVER: "GAME_OVER", 
    
    // Chat Messages 
    CHAT_MESSAGE: "CHAT_MESSAGE", 

    // Disconnect/Control
    DISCONNECT: "DISCONNECT",
};

export const RELIABILITY_FIELDS = {
    SEQUENCE_NUMBER: 'sequence_number',
    ACK_NUMBER: 'ack_number',
};

export const HANDSHAKE_FIELDS = {
    PEER_ID: 'peer_id',
    SEED: 'seed', 
    TEAM_PREVIEW: 'team_preview',
    TIMESTAMP: 'timestamp',
};