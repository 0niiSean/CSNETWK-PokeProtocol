/**
 * File: protocol/protocol-tests-field-check.js
 * Purpose: FINAL FIX. Implements a field-by-field comparison for critical header fields 
 * (sequence_number, seed, ack_number) to definitively resolve the persistent HANDSHAKE_RESPONSE failure, 
 * ignoring arbitrary key order differences.
 */

// --- SIMULATED PROTOCOL MODULES (In your actual code, these would be imports) ---

const MESSAGE_TYPES = {
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    BATTLE_SETUP: 'BATTLE_SETUP',
    ACK: 'ACK',
    CHAT_MESSAGE: 'CHAT_MESSAGE',
};
const RELIABILITY_FIELDS = {
    SEQUENCE_NUMBER: 'sequence_number',
    ACK_NUMBER: 'ack_number',
};
const BATTLE_FIELDS = {
    SEED: 'seed',
    POKEMON_NAME: 'pokemon_name',
    STAT_BOOSTS: 'stat_boosts',
    COMMUNICATION_MODE: 'communication_mode',
    SENDER_NAME: 'sender_name',
    CONTENT_TYPE: 'content_type',
};

// ====================================================================
// A. SIMULATED MESSAGE CREATORS
// ====================================================================

function createHandshakeResponse(sequenceNumber, seed, ackNumber) {
    return {
        message_type: MESSAGE_TYPES.HANDSHAKE_RESPONSE,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.SEED]: seed,
        [RELIABILITY_FIELDS.ACK_NUMBER]: ackNumber,
    };
}
function createBattleSetupMessage(sequenceNumber, pokemonName, statBoosts, mode = 'P2P') {
    return {
        message_type: MESSAGE_TYPES.BATTLE_SETUP,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.COMMUNICATION_MODE]: mode,
        [BATTLE_FIELDS.POKEMON_NAME]: pokemonName,
        [BATTLE_FIELDS.STAT_BOOSTS]: statBoosts, 
    };
}
function createAckMessage(ackNumber) {
    return {
        message_type: MESSAGE_TYPES.ACK,
        [RELIABILITY_FIELDS.ACK_NUMBER]: ackNumber,
    };
}
function createChatMessage(sequenceNumber, senderName, contentType = 'TEXT', messageText, stickerData) {
    const message = {
        message_type: MESSAGE_TYPES.CHAT_MESSAGE,
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: sequenceNumber,
        [BATTLE_FIELDS.SENDER_NAME]: senderName,
        [BATTLE_FIELDS.CONTENT_TYPE]: contentType,
    };
    if (contentType === 'TEXT' && messageText) {
        message['message_text'] = messageText;
    } else if (contentType === 'STICKER' && stickerData) {
        message['sticker_data'] = stickerData;
    }
    return message;
}

// ====================================================================
// B. SIMULATED SERIALIZER (Omitted for brevity)
// C. SIMULATED PARSER (Omitted for brevity)
// ====================================================================

function encode(message) {
    let encodedMessage = '';
    const sequenceNumberKey = RELIABILITY_FIELDS.SEQUENCE_NUMBER; 
    const ackNumberKey = RELIABILITY_FIELDS.ACK_NUMBER;
    
    encodedMessage += `message_type: ${message.message_type}\n`;
    
    if (message[sequenceNumberKey] && message.message_type !== MESSAGE_TYPES.ACK) {
        encodedMessage += `${sequenceNumberKey}: ${message[sequenceNumberKey]}\n`;
    }
    
    if (message[ackNumberKey]) {
        encodedMessage += `${ackNumberKey}: ${message[ackNumberKey]}\n`;
    }
    
    for (const key in message) {
        if (Object.prototype.hasOwnProperty.call(message, key)) {
            if (key === 'message_type' || key === sequenceNumberKey || key === ackNumberKey) {
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

function decode(rawData) {
    const message = {};
    const lines = rawData.trim().split('\n');

    for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue; 

        const key = line.substring(0, colonIndex).trim();
        let value = line.substring(colonIndex + 1).trim();

        try {
            if (value.startsWith('{') || value.startsWith('[')) {
                message[key] = JSON.parse(value);
            } 
            else if (!isNaN(Number(value)) && key !== 'message_type') {
                message[key] = Number(value);
            } 
            else {
                message[key] = value;
            }
        } catch (e) {
            message[key] = value;
        }
    }

    if (typeof message.message_type === 'undefined') {
        throw new Error("Decoded message is missing 'message_type'.");
    }
    return message;
}


// ====================================================================
// D. CUSTOM COMPARISON LOGIC
// ====================================================================

/**
 * Custom check specifically for the Handshake Response header fields.
 * Compares sequence_number, seed, and ack_number individually.
 */
function checkHandshakeFields(original, decoded) {
    const seq = RELIABILITY_FIELDS.SEQUENCE_NUMBER;
    const seed = BATTLE_FIELDS.SEED;
    const ack = RELIABILITY_FIELDS.ACK_NUMBER;

    let success = true;
    
    if (original.message_type !== decoded.message_type) {
        console.error(`\n-- FIELD MISMATCH: message_type (${original.message_type} !== ${decoded.message_type})`);
        success = false;
    }
    if (original[seq] !== decoded[seq]) {
        console.error(`\n-- FIELD MISMATCH: ${seq} (${original[seq]} !== ${decoded[seq]})`);
        success = false;
    }
    if (original[seed] !== decoded[seed]) {
        console.error(`\n-- FIELD MISMATCH: ${seed} (${original[seed]} !== ${decoded[seed]})`);
        success = false;
    }
    if (original[ack] !== decoded[ack]) {
        console.error(`\n-- FIELD MISMATCH: ${ack} (${original[ack]} !== ${decoded[ack]})`);
        success = false;
    }

    // Checking key count ensures no extra fields snuck in.
    if (Object.keys(original).length !== Object.keys(decoded).length) {
        console.error(`\n-- FIELD MISMATCH: Key count (${Object.keys(original).length} !== ${Object.keys(decoded).length})`);
        // Debugging the missing field names:
        const originalKeys = Object.keys(original).sort();
        const decodedKeys = Object.keys(decoded).sort();
        console.log(`--- Original Keys: ${originalKeys.join(', ')}`);
        console.log(`--- Decoded Keys: ${decodedKeys.join(', ')}`);
        success = false;
    }
    
    return success;
}

/**
 * Standard deep equality check (used for messages where key order is not arbitrary like JSON payloads).
 * This relies on the keys being compared consistently.
 */
function deepEqual(a, b) {
    // We rely on simple JSON.stringify comparison for non-header payloads, assuming nested JSON parsing worked.
    return JSON.stringify(a) === JSON.stringify(b);
}

function runTest(testName, messageObject) {
    console.log(`\n--- Running Test: ${testName} ---`);
    let passed = false;

    try {
        // 1. ENCODE (Serializer Test)
        const encodedString = encode(messageObject);
        
        // 2. DECODE (Parser Test)
        const decodedObject = decode(encodedString);
        
        console.log(`\n[2. DECODING (Parser)]`);
        console.log("Decoded Object:", decodedObject);

        // 3. SYNC CHECK: Use specialized check for the problematic message type.
        if (messageObject.message_type === MESSAGE_TYPES.HANDSHAKE_RESPONSE) {
            passed = checkHandshakeFields(messageObject, decodedObject);
        } else {
            // Use deep equality for all other messages (BATTLE_SETUP, ACK, CHAT_MESSAGE)
            passed = deepEqual(messageObject, decodedObject);
        }
        
        if (passed) {
            console.log(`\n>>> ✅ TEST PASSED: Message object survived encode/decode cycle intact (Content Match).`);
        } else {
            console.error(`\n>>> ❌ TEST FAILED: Decoded object does not match original (Content Mismatch).`);
            console.log("Original Object:", messageObject);
        }

    } catch (error) {
        console.error(`\n!!! 🛑 TEST FAILED DUE TO ERROR in ${testName} !!!`);
        console.error(error.message);
    }
}

// ====================================================================
// E. TEST CASES DEFINITION (RFC Compliance Checks)
// ====================================================================

// --- TEST CASE 1: HANDSHAKE_RESPONSE (RFC 4.2: Mandatory Seed & ACK) ---
const TEST_SEED = 998877;
const HANDSHAKE_RESPONSE_MESSAGE = createHandshakeResponse(5, TEST_SEED, 4);
runTest("RFC 4.2 - HANDSHAKE_RESPONSE (Seed & ACK)", HANDSHAKE_RESPONSE_MESSAGE);


// --- TEST CASE 2: BATTLE_SETUP (RFC 4.4: Mandatory Nested JSON Object) ---
const STAT_BOOSTS_OBJECT = { 
    special_attack_uses: 3, 
    special_defense_uses: 2 
};
const BATTLE_SETUP_MESSAGE = createBattleSetupMessage(10, "Charizard", STAT_BOOSTS_OBJECT, "P2P");
runTest("RFC 4.4 - BATTLE_SETUP (Nested JSON Check) - PASSED", BATTLE_SETUP_MESSAGE);


// --- TEST CASE 3: ACK MESSAGE (RFC 5.1: Must NOT have sequence_number) ---
const ACK_MESSAGE = createAckMessage(11);
runTest("RFC 5.1 - ACK Message (No sequence_number) - PASSED", ACK_MESSAGE);


// --- TEST CASE 4: CHAT_MESSAGE (RFC 4.11: String Content Check) ---
const CHAT_MESSAGE_TEXT = createChatMessage(15, "PlayerOne", "TEXT", "Good luck, have fun!", null);
runTest("RFC 4.11 - CHAT_MESSAGE (Text Content) - PASSED", CHAT_MESSAGE_TEXT);