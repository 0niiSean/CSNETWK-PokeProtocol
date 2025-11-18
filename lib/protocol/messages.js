// lib/protocol/messages.js

import { MESSAGE_TYPES, HANDSHAKE_FIELDS, RELIABILITY_FIELDS } from './constants.js';

// ====================================================================
// MESSAGE CONSTRUCTION FUNCTIONS (NO 'export' KEYWORD HERE)
// ====================================================================

/**
 * Validates that a message object contains all fields required for a
 * HANDSHAKE_REQUEST message.
 * @param {Object} message - The message object to validate.
 */
function validateHandshakeRequest(message) {
    const requiredFields = [
        RELIABILITY_FIELDS.SEQUENCE_NUMBER, 
        HANDSHAKE_FIELDS.PEER_ID,
        HANDSHAKE_FIELDS.SEED,
        HANDSHAKE_FIELDS.TEAM_PREVIEW,
    ];
    
    if (message.message_type !== MESSAGE_TYPES.HANDSHAKE_REQUEST) {
        throw new Error(`Validation Error: Expected type ${MESSAGE_TYPES.HANDSHAKE_REQUEST}`);
    }

    for (const field of requiredFields) {
        if (typeof message[field] === 'undefined') {
            throw new Error(`Validation Error: HANDSHAKE_REQUEST is missing mandatory field: ${field}`);
        }
    }
}

/**
 * Creates a standard HANDSHAKE_REQUEST message object.
 * @param {string} peerId - The unique ID of the connecting peer.
 * @param {number} seed - The random seed for battle calculation synchronization.
 * @param {Array<string>} teamPreview - Array of Pokémon names (length 1 for 1v1).
 * @returns {Object} The complete message object ready for encoding.
 */
function createHandshakeRequest(peerId, seed, teamPreview) {
    // CRITICAL FIX: Team length is 1 for the 1v1 MVB.
    if (!peerId || !seed || !teamPreview || teamPreview.length !== 1) {
        throw new Error("Invalid parameters for HANDSHAKE_REQUEST creation. Team length must be 1.");
    }
    
    const message = {
        message_type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: 1, 
        [HANDSHAKE_FIELDS.PEER_ID]: peerId,
        [HANDSHAKE_FIELDS.SEED]: seed,
        [HANDSHAKE_FIELDS.TEAM_PREVIEW]: teamPreview, 
    };

    validateHandshakeRequest(message); 
    return message;
}

/**
 * Creates a standard HANDSHAKE_RESPONSE message object.
 * @param {string} peerId - The unique ID of the responding peer.
 * @param {Array<string>} teamPreview - Array of Pokémon names of the responder (length 1).
 * @param {number} seed - The synchronized random seed.
 * @param {number} ackNumber - The sequence_number of the request being acknowledged.
 * @returns {Object} The complete message object ready for encoding.
 */
function createHandshakeResponse(peerId, teamPreview, seed, ackNumber) {
    // CRITICAL FIX: Team length is 1 for the 1v1 MVB.
    if (!peerId || !teamPreview || teamPreview.length !== 1 || !seed) {
        throw new Error("Invalid parameters for HANDSHAKE_RESPONSE creation. Team length must be 1.");
    }
    if (typeof ackNumber !== 'number' || ackNumber <= 0) { 
        throw new Error("Invalid ACK number provided for HANDSHAKE_RESPONSE.");
    }

    const message = {
        message_type: MESSAGE_TYPES.HANDSHAKE_RESPONSE,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: 0, 
        [HANDSHAKE_FIELDS.PEER_ID]: peerId,
        [HANDSHAKE_FIELDS.TEAM_PREVIEW]: teamPreview,
        [HANDSHAKE_FIELDS.SEED]: seed, // CRITICAL: Includes seed as required by RFC
        [HANDSHAKE_FIELDS.TIMESTAMP]: Date.now(),
        [RELIABILITY_FIELDS.ACK_NUMBER]: ackNumber, 
    };

    return message;
}

/**
 * Creates an ACK message object to acknowledge receipt of a specific packet.
 * @param {number} ackNumber - The sequence_number of the packet being acknowledged.
 * @returns {Object} The ACK message object ready for encoding.
 */
function createAckMessage(ackNumber) {
    if (typeof ackNumber !== 'number' || ackNumber <= 0) {
        throw new Error("Invalid ACK number provided.");
    }

    return {
        message_type: MESSAGE_TYPES.ACK,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: 0, 
        [RELIABILITY_FIELDS.ACK_NUMBER]: ackNumber,
    };
}


/**
 * Extracts the critical header fields (message_type, sequence_number, ack_number) 
 * from the raw packet string.
 * @param {string} rawData - The raw newline-separated string data from the UDP packet.
 * @returns {Object} An object containing the parsed header information.
 */
function parseHeader(rawData) {
    const header = {
        message_type: null,
        sequence_number: null,
        ack_number: null,
    };
    
    // Check the first few lines for efficiency
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

    return header;
}

/**
 * Creates a SPECTATOR_REQUEST message object.
 * @param {string} peerId - The unique ID of the requesting peer.
 * @returns {Object} The message object.
 */
function createSpectatorRequest(peerId) {
    if (!peerId) throw new Error("Peer ID is required for SPECTATOR_REQUEST.");
    return {
        message_type: MESSAGE_TYPES.SPECTATOR_REQUEST,
        [HANDSHAKE_FIELDS.PEER_ID]: peerId,
    };
}

/**
 * Creates a ATTACK_ANNOUNCE message object.
 */
function createAttackAnnounceMessage(gameId, moveName) {
    return {
        message_type: MESSAGE_TYPES.ATTACK_ANNOUNCE,
        game_id: gameId,
        move_name: moveName, // CRITICAL FIX: Use move_name per RFC standard
    };
}

/**
 * Creates a CALCULATION_REPORT message object. (RFC 4.7)
 * @param {string} gameId - The ID of the battle.
 * @param {Array<Object>} results - The calculated turn results (1 or 2 attack phases).
 * @returns {Object} The message object.
 */
function createCalculationReportMessage(gameId, results) {
    return {
        message_type: MESSAGE_TYPES.CALCULATION_REPORT,
        game_id: gameId,
        results: results, 
    };
}

/**
 * Creates a CHAT_MESSAGE object.
 * @param {string} peerId - The ID of the sender.
 * @param {string} content - The text or Base64 encoded sticker data.
 * @param {string} contentType - 'TEXT' or 'STICKER'.
 * @returns {Object} The chat message object.
 */
function createChatMessage(peerId, content, contentType = 'TEXT') {
    return {
        message_type: MESSAGE_TYPES.CHAT_MESSAGE,
        peer_id: peerId,
        content_type: contentType,
        content: content,
        timestamp: Date.now(),
    };
}

function createGameOverMessage(gameId, winnerId) {
    return {
        message_type: MESSAGE_TYPES.GAME_OVER,
        game_id: gameId,
        winner_id: winnerId,
    };
}

/**
 * Creates a RESOLUTION_REQUEST message object. (RFC 4.9)
 * @param {string} gameId - The ID of the battle.
 * @param {Array<Object>} discrepancyData - The sender's calculated values to propose as the source of truth.
 * @returns {Object} The message object.
 */
function createResolutionRequestMessage(gameId, discrepancyData) {
    return {
        message_type: MESSAGE_TYPES.RESOLUTION_REQUEST,
        game_id: gameId,
        discrepancy_data: discrepancyData,
    };
}

/**
 * Creates a CALCULATION_CONFIRM message object. (RFC 4.8)
 * @param {string} gameId - The ID of the battle.
 * @param {number} turn - The turn number being confirmed.
 * @returns {Object} The message object.
 */
function createCalculationConfirmMessage(gameId, turn) {
    return {
        message_type: MESSAGE_TYPES.CALCULATION_CONFIRM,
        game_id: gameId,
        turn: turn,
    };
}

/**
 * Creates a DEFENSE_ANNOUNCE message object.
 * @param {string} gameId - The ID of the battle.
 * @param {string} defenseAction - The defender's action (e.g., 'READY', 'SWITCH').
 * @returns {Object} The message object.
 */
function createDefenseAnnounceMessage(gameId, defenseAction) {
    return {
        message_type: MESSAGE_TYPES.DEFENSE_ANNOUNCE,
        game_id: gameId,
        defense_action: defenseAction,
    };
}

/**
 * Creates a BATTLE_SETUP message object.
 * @param {string} gameId - The ID of the current battle.
 * @param {Array<Object>} teamData - Array of team Pokémon data objects.
 * @param {Object} statBoosts - The player's stat boost allocation.
 * @param {string} mode - The communication mode ('P2P' or 'BROADCAST').
 * @returns {Object} The message object.
 */
function createBattleSetupMessage(gameId, teamData, statBoosts, mode = 'P2P') {
    return {
        message_type: MESSAGE_TYPES.BATTLE_SETUP,
        game_id: gameId,
        team_data: teamData,
        stat_boosts: statBoosts, 
        communication_mode: mode,
    };
}

// ====================================================================
// FINAL EXPORT BLOCK (All functions exposed here)
// ====================================================================
export { 
    validateHandshakeRequest,
    createHandshakeRequest,
    createHandshakeResponse,
    createAckMessage, 
    parseHeader,
    createSpectatorRequest,
    createAttackAnnounceMessage,
    createCalculationReportMessage,
    createChatMessage,
    createGameOverMessage,
    createResolutionRequestMessage,
    createCalculationConfirmMessage,
    createDefenseAnnounceMessage,
    createBattleSetupMessage, // This is the ONLY place it is exported
};