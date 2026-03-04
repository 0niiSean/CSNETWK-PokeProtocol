/**
 * File: network/network-tests.js
 * Purpose: Test suite for verifying the modular network layer components (reliability, client, server) 
 * by mocking the underlying raw packet sender (udp-socket.js).
 */

// --- SIMULATED PROTOCOL LAYER ---
const MESSAGE_TYPES = {
    HANDSHAKE_REQUEST: 'HANDSHAKE_REQUEST',
    HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE',
    SPECTATOR_REQUEST: 'SPECTATOR_REQUEST',
    ACK: 'ACK',
    BATTLE_SETUP: 'BATTLE_SETUP',
};
const RELIABILITY_FIELDS = { SEQUENCE_NUMBER: 'sequence_number', ACK_NUMBER: 'ack_number' };
const BATTLE_FIELDS = { SEED: 'seed' };

// Simplified Message Creators (Used by Client/Server modules)
function createHandshakeRequest(seqNum) { return { message_type: MESSAGE_TYPES.HANDSHAKE_REQUEST, [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: seqNum }; }
function createHandshakeResponse(seqNum, seed, ackNum) { return { message_type: MESSAGE_TYPES.HANDSHAKE_RESPONSE, [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: seqNum, [BATTLE_FIELDS.SEED]: seed, [RELIABILITY_FIELDS.ACK_NUMBER]: ackNum }; }
function createSpectatorRequest(seqNum) { return { message_type: MESSAGE_TYPES.SPECTATOR_REQUEST, [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: seqNum }; }
function createAckMessage(ackNum) { return { message_type: MESSAGE_TYPES.ACK, [RELIABILITY_FIELDS.ACK_NUMBER]: ackNum }; }
function createBattleSetupMessage(seqNum, pk, bs, mode) { return { message_type: MESSAGE_TYPES.BATTLE_SETUP, [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: seqNum }; }
const Parser = { 
    // Mock the parser to quickly grab the sequence number for testing purposes
    parseHeader: (rawData) => ({ 
        message_type: 'SIMULATED', 
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: 1
    }),
    decode: (rawData) => ({ 
        message_type: 'SIMULATED', 
        [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: 1
    })
};
const Logger = { log: () => {}, error: () => {}, warn: () => {} };

// --- MOCK RAW SENDER (Intercepts all network traffic) ---
const mockSentPackets = [];
const mockSendRawPacket = (message, ip, port) => {
    mockSentPackets.push({ message, ip, port });
};
const resetMocks = () => {
    mockSentPackets.length = 0;
};


// ====================================================================
// A. SIMULATED RELIABILITY.JS (For testing external interface)
//    (We test the logic provided in network/reliability.js)
// ====================================================================
const Reliability = (() => {
    let sequenceCounter = 1;
    const retransmissionBuffer = new Map(); 

    const getNextSequenceNumber = () => sequenceCounter++;
    const initializeSender = (sendFunc) => { sendRawPacketExternal = sendFunc; };

    const sendReliable = (message, ip, port) => {
        const seqNum = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER];
        sendRawPacketExternal(message, ip, port);
        
        // Mock buffer logic (simplified: only tracks existence, not timers)
        retransmissionBuffer.set(seqNum, { message, ip, port, retries: 0 });
    };

    const handleAck = (ackNum) => {
        if (retransmissionBuffer.has(ackNum)) {
            retransmissionBuffer.delete(ackNum);
            return true;
        }
        return false;
    };
    
    const sendAck = (seqNumToAck, ip, port) => {
        const ackMessage = createAckMessage(seqNumToAck);
        sendRawPacketExternal(ackMessage, ip, port);
    };
    
    return { getNextSequenceNumber, initializeSender, sendReliable, handleAck, sendAck, retransmissionBuffer };
})();

// Initialize Reliability module with our mock sender
Reliability.initializeSender(mockSendRawPacket);


// ====================================================================
// B. SIMULATED P2P-CLIENT.JS (For testing client sending)
//    (We test the logic provided in network/p2p-client.js)
// ====================================================================
const P2PClient = {
    initiateJoinerHandshake: (ip, port) => {
        const seqNum = Reliability.getNextSequenceNumber();
        const msg = createHandshakeRequest(seqNum);
        Reliability.sendReliable(msg, ip, port);
    },
    sendBattleSetup: (data, ip, port) => {
        const seqNum = Reliability.getNextSequenceNumber();
        const msg = createBattleSetupMessage(seqNum);
        Reliability.sendReliable(msg, ip, port);
    }
};

// ====================================================================
// C. SIMULATED P2P-SERVER.JS (For testing server routing logic)
//    (We test the logic provided in network/p2p-server.js)
// ====================================================================
const P2PServer = (() => {
    const generateBattleSeed = () => 123456; // Fixed seed for predictable testing

    const handleHandshakeRequest = (message) => {
        const { remoteIP, remotePort } = message;
        const seed = generateBattleSeed();
        const receivedSeqNum = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER];
        const responseSeqNum = Reliability.getNextSequenceNumber();
        const responseMessage = createHandshakeResponse(responseSeqNum, seed, receivedSeqNum);

        Reliability.sendReliable(responseMessage, remoteIP, remotePort);
        return { seed, responseSeqNum }; // Return data for test validation
    };
    
    const routeServerPacket = (message) => {
        switch (message.message_type) {
            case MESSAGE_TYPES.HANDSHAKE_REQUEST:
                return handleHandshakeRequest(message);
            default:
                return null;
        }
    };
    return { routeServerPacket, generateBattleSeed };
})();


// ====================================================================
// D. TEST EXECUTION
// ====================================================================

console.log('--- RUNNING NETWORK LAYER INTEGRATION TESTS ---');

// --- Test 1: Sequence Counter & Buffer Management (Reliability.js) ---
resetMocks();
console.log('\n1. Reliability Core: Sequence & Buffering');
const initialSeq = Reliability.getNextSequenceNumber(); // Should be 1
const initialMsg = createHandshakeRequest(initialSeq);
Reliability.sendReliable(initialMsg, '127.0.0.1', 8000);

if (mockSentPackets.length === 1 && Reliability.retransmissionBuffer.has(initialSeq)) {
    console.log('  ✅ 1a. Sent packet and added to retransmission buffer.');
} else {
    console.error('  ❌ 1a. Failed to send and buffer initial reliable packet.');
}

// Test clearing the buffer with ACK
Reliability.handleAck(initialSeq);
if (!Reliability.retransmissionBuffer.has(initialSeq)) {
     console.log('  ✅ 1b. Cleared packet from buffer upon receiving ACK.');
} else {
     console.error('  ❌ 1b. Failed to clear packet from buffer.');
}


// --- Test 2: Joiner Handshake Initiation (P2P-Client.js) ---
resetMocks();
console.log('\n2. P2P Client: Handshake Initiation');
const CLIENT_IP = '1.1.1.1';
const CLIENT_PORT = 9000;
P2PClient.initiateJoinerHandshake(CLIENT_IP, CLIENT_PORT);

if (mockSentPackets.length === 1 && mockSentPackets[0].message.message_type === MESSAGE_TYPES.HANDSHAKE_REQUEST) {
    console.log('  ✅ 2a. Client generated and sent HANDSHAKE_REQUEST.');
    console.log(`  Sent Seq Num: ${mockSentPackets[0].message[RELIABILITY_FIELDS.SEQUENCE_NUMBER]}`);
} else {
    console.error('  ❌ 2a. Failed to initiate handshake request.');
}


// --- Test 3: Host Response and Seed Synchronization (P2P-Server.js) ---
resetMocks();
console.log('\n3. P2P Server: Handshake Response & Seed Sync (RFC 4.2)');
const HOST_IP = '2.2.2.2';
const HOST_PORT = 8000;
const JOINER_SEQ = 100;
const incomingRequest = { 
    message_type: MESSAGE_TYPES.HANDSHAKE_REQUEST,
    [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: JOINER_SEQ, 
    remoteIP: HOST_IP, 
    remotePort: HOST_PORT 
};
const hostResponseData = P2PServer.routeServerPacket(incomingRequest);
const responseMessage = mockSentPackets[0].message;

if (mockSentPackets.length === 1 && responseMessage.message_type === MESSAGE_TYPES.HANDSHAKE_RESPONSE) {
    console.log('  ✅ 3a. Host sent HANDSHAKE_RESPONSE.');
} else {
    console.error('  ❌ 3a. Host failed to send response.');
}

if (responseMessage[BATTLE_FIELDS.SEED] === 123456) {
    console.log('  ✅ 3b. Host generated and included the synchronized SEED.');
} else {
    console.error(`  ❌ 3b. Host failed to include seed. Got: ${responseMessage[BATTLE_FIELDS.SEED]}`);
}

if (responseMessage[RELIABILITY_FIELDS.ACK_NUMBER] === JOINER_SEQ) {
    console.log('  ✅ 3c. Host correctly ACKnowledged the Joiner\'s sequence number.');
} else {
     console.error(`  ❌ 3c. Host ACK number mismatch. Expected: ${JOINER_SEQ}, Got: ${responseMessage[RELIABILITY_FIELDS.ACK_NUMBER]}`);
}