/**
 * File: protocol/message-creators.js
 * Purpose: Contains functions to construct every specific message type defined in the PokeProtocol RFC.
 * This layer ensures all required fields (especially sequence_number) are included and data structures
 * match the specification before serialization and transmission.
 * * Dependencies: protocol/constants.js
 */

import { 
    MESSAGE_TYPES, 
    RELIABILITY_FIELDS, 
    BATTLE_FIELDS, 
    RELIABILITY_CONFIG 
} from './constants.js';

// ====================================================================
// SECTION 1: HANDSHAKE & SETUP MESSAGES (RFC 4.1 - 4.4)
// ====================================================================

/**
 * Creates a HANDSHAKE_REQUEST message object. (RFC 4.1)
 * @param {number} sequenceNumber - The unique, monotonically increasing integer for this message.
 * @returns {Object} The message object.
 */
export function createHandshakeRequest(sequenceNumber) {
    if (typeof sequenceNumber !== 'number' || sequenceNumber <= 0) {
        throw new Error("Invalid sequence number for HANDSHAKE_REQUEST creation.");
    }
    
    return {
        message_type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber, 
    };
}

/**
 * Creates a HANDSHAKE_RESPONSE message object. (RFC 4.2)
 * CRITICAL: Host Peer includes the SEED and ACKs the request.
 * @param {number} sequenceNumber - The unique sequence number for this response.
 * @param {number} seed - A random integer to seed the RNG for battle sync.
 * @param {number} ackNumber - The sequence_number of the request being acknowledged.
 * @returns {Object} The message object.
 */
export function createHandshakeResponse(sequenceNumber, seed, ackNumber) {
    if (typeof seed !== 'number' || seed <= 0) {
        throw new Error("Invalid seed provided for HANDSHAKE_RESPONSE.");
    }
    if (typeof ackNumber !== 'number' || ackNumber <= 0) { 
        throw new Error("Invalid ACK number provided for HANDSHAKE_RESPONSE.");
    }

    return {
        message_type: MESSAGE_TYPES.HANDSHAKE_RESPONSE,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.SEED]: seed,
        [RELIABILITY_FIELDS.ACK_NUMBER]: ackNumber,
    };
}

/**
 * Creates a SPECTATOR_REQUEST message object. (RFC 4.3)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @returns {Object} The message object.
 */
export function createSpectatorRequest(sequenceNumber) {
    return {
        message_type: MESSAGE_TYPES.SPECTATOR_REQUEST,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
    };
}

/**
 * Creates a BATTLE_SETUP message object. (RFC 4.4)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @param {string} pokemonName - The name of the peer's Pokémon.
 * @param {Object} statBoosts - The player's stat boost allocation (e.g., {"special_attack_uses": 5, "special_defense_uses": 5}).
 * @param {string} mode - The communication mode ('P2P' or 'BROADCAST').
 * @returns {Object} The message object.
 */
export function createBattleSetupMessage(sequenceNumber, pokemonName, statBoosts, mode = 'P2P') {
    if (!pokemonName || !statBoosts || !mode) {
        throw new Error("Missing mandatory fields for BATTLE_SETUP.");
    }
    
    // NOTE: The RFC states: 'pokemon: An object containing the peer's chosen Pokémon data.'
    // However, the example only shows 'pokemon_name'. We follow the example fields exactly.
    return {
        message_type: MESSAGE_TYPES.BATTLE_SETUP,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.COMMUNICATION_MODE]: mode,
        [BATTLE_FIELDS.POKEMON_NAME]: pokemonName,
        [BATTLE_FIELDS.STAT_BOOSTS]: statBoosts, 
    };
}

// ====================================================================
// SECTION 2: TURN HANDSHAKE MESSAGES (RFC 4.5 - 4.9)
// ====================================================================

/**
 * Creates an ATTACK_ANNOUNCE message object. (RFC 4.5)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @param {string} moveName - The name of the chosen move.
 * @returns {Object} The message object.
 */
export function createAttackAnnounceMessage(sequenceNumber, moveName) {
    if (!moveName) throw new Error("Move name is required for ATTACK_ANNOUNCE.");
    return {
        message_type: MESSAGE_TYPES.ATTACK_ANNOUNCE,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.MOVE_NAME]: moveName, 
    };
}

/**
 * Creates a DEFENSE_ANNOUNCE message object. (RFC 4.6)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @returns {Object} The message object.
 */
export function createDefenseAnnounceMessage(sequenceNumber) {
    return {
        message_type: MESSAGE_TYPES.DEFENSE_ANNOUNCE,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
    };
}

/**
 * Creates a CALCULATION_REPORT message object. (RFC 4.7)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @param {string} attacker - The name of the Pokémon that attacked.
 * @param {string} moveUsed - The name of the move that was used.
 * @param {number} remainingHealth - The remaining health of the *attacking* Pokémon.
 * @param {number} damageDealt - The amount of damage inflicted.
 * @param {number} defenderHpRemaining - The defender's remaining HP after the attack.
 * @param {string} statusMessage - A descriptive string of the turn's events.
 * @returns {Object} The message object.
 */
export function createCalculationReportMessage(sequenceNumber, attacker, moveUsed, remainingHealth, damageDealt, defenderHpRemaining, statusMessage) {
    return {
        message_type: MESSAGE_TYPES.CALCULATION_REPORT,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.ATTACKER]: attacker,
        [BATTLE_FIELDS.MOVE_USED]: moveUsed,
        [BATTLE_FIELDS.REMAINING_HEALTH]: remainingHealth,
        [BATTLE_FIELDS.DAMAGE_DEALT]: damageDealt,
        [BATTLE_FIELDS.DEFENDER_HP_REMAINING]: defenderHpRemaining,
        [BATTLE_FIELDS.STATUS_MESSAGE]: statusMessage,
    };
}

/**
 * Creates a CALCULATION_CONFIRM message object. (RFC 4.8)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @returns {Object} The message object.
 */
export function createCalculationConfirmMessage(sequenceNumber) {
    return {
        message_type: MESSAGE_TYPES.CALCULATION_CONFIRM,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
    };
}

/**
 * Creates a RESOLUTION_REQUEST message object. (RFC 4.9)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @param {string} attacker - The name of the Pokémon that attacked.
 * @param {string} moveUsed - The name of the move that was used.
 * @param {number} damageDealt - The amount of damage inflicted as calculated by the sender.
 * @param {number} defenderHpRemaining - The defender's remaining HP as calculated by the sender.
 * @returns {Object} The message object.
 */
export function createResolutionRequestMessage(sequenceNumber, attacker, moveUsed, damageDealt, defenderHpRemaining) {
    return {
        message_type: MESSAGE_TYPES.RESOLUTION_REQUEST,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.ATTACKER]: attacker,
        [BATTLE_FIELDS.MOVE_USED]: moveUsed,
        [BATTLE_FIELDS.DAMAGE_DEALT]: damageDealt,
        [BATTLE_FIELDS.DEFENDER_HP_REMAINING]: defenderHpRemaining,
    };
}

// ====================================================================
// SECTION 3: FINAL & ASYNCHRONOUS MESSAGES (RFC 4.10 - 4.11)
// ====================================================================

/**
 * Creates a GAME_OVER message object. (RFC 4.10)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @param {string} winner - The name of the Pokémon that won.
 * @param {string} loser - The name of the Pokémon that fainted.
 * @returns {Object} The message object.
 */
export function createGameOverMessage(sequenceNumber, winner, loser) {
    return {
        message_type: MESSAGE_TYPES.GAME_OVER,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.WINNER]: winner,
        [BATTLE_FIELDS.LOSER]: loser,
    };
}

/**
 * Creates a CHAT_MESSAGE object. (RFC 4.11)
 * @param {number} sequenceNumber - The unique sequence number for this message.
 * @param {string} senderName - The name of the peer sending the message.
 * @param {string} contentType - 'TEXT' or 'STICKER'.
 * @param {string} messageText - (Optional) The content for TEXT messages.
 * @param {string} stickerData - (Optional) Base64 encoded sticker data.
 * @returns {Object} The chat message object.
 */
export function createChatMessage(sequenceNumber, senderName, contentType = 'TEXT', messageText, stickerData) {
    const message = {
        message_type: MESSAGE_TYPES.CHAT_MESSAGE,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.SENDER_NAME]: senderName,
        [BATTLE_FIELDS.CONTENT_TYPE]: contentType,
    };

    if (contentType === 'TEXT' && messageText) {
        message[BATTLE_FIELDS.MESSAGE_TEXT] = messageText; // Using constants for MESSAGE_TEXT if defined
    } else if (contentType === 'STICKER' && stickerData) {
        message[BATTLE_FIELDS.STICKER_DATA] = stickerData; // Using constants for STICKER_DATA if defined
    }
    // NOTE: If BATTLE_FIELDS doesn't have MESSAGE_TEXT/STICKER_DATA, the previous fix using 
    // literal strings 'message_text'/'sticker_data' should be used. Assuming the BATTLE_FIELDS
    // in constants.js was comprehensive.

    return message;
}

// ====================================================================
// SECTION 4: PROTOCOL OVERHEAD MESSAGES (Reliability Layer)
// ====================================================================

/**
 * Creates an ACK message object to acknowledge receipt of a specific packet. 
 * NOTE: ACK messages DO NOT carry a sequence_number of their own. (RFC 5.1)
 * @param {number} ackNumber - The sequence_number of the packet being acknowledged.
 * @returns {Object} The ACK message object ready for encoding.
 */
export function createAckMessage(ackNumber) {
    if (typeof ackNumber !== 'number' || ackNumber <= 0) {
        throw new Error("Invalid ACK number provided.");
    }

    return {
        message_type: MESSAGE_TYPES.ACK,
        [RELIABILITY_FIELDS.ACK_NUMBER]: ackNumber,
    };
}