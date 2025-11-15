const Logger = require('./lib/utils/logger');
const Protocol = require('./lib/protocol').default;
const { loadPokemonData, initializeState } = require('./lib/game/game_state');
const StateMachine = require('./lib/protocol/state_machine');

// CRITICAL FIX: Import the entire module object to safely override and call methods.
const udpSocketModule = require('./lib/network/udp_socket'); 
const { initSocket, closeSocket } = udpSocketModule;

// --- CONFIGURATION ---
const HOST_PORT = 5020; 
const JOINER_PORT = 5021;
const HOST_IP = '127.0.0.1';
const HOST_ID = 'Host-A';
const JOINER_ID = 'Joiner-B';

// --- MOCK STATE for Packet Loss ---
let originalSendPacket = udpSocketModule.sendPacket; // CRITICAL: Save the original function globally
let packetsDropped = 0;

/**
 * Mock function to intentionally drop the first ACK packet from the Joiner.
 * This function now uses the globally saved 'originalSendPacket' when it needs to send.
 */
function sendPacketLossMock(messageObject, remoteIP, remotePort) {
    
    // CRITICAL: We only want to drop the first ACK we see.
    if (messageObject.message_type === Protocol.MESSAGE_TYPES.ACK && packetsDropped < 1) {
        packetsDropped++;
        Logger.warn('TEST FIXTURE', `SIMULATED LOSS: Dropping ACK reply for Data Seq #${messageObject.ack_number} to force retransmission.`);
        return messageObject.sequence_number; // Don't send, but return sequence number
    }
    
    // Use the real, saved send function for all non-dropped packets
    return originalSendPacket(messageObject, remoteIP, remotePort);
}

// --- TEST EXECUTION FLOW ---

Logger.log('TEST', 'Starting Full Retransmission Test...');
loadPokemonData();
initializeState(HOST_ID, ['Bulbasaur', 'Venusaur', 'Charizard'], JOINER_ID, ['Pikachu', 'Gengar', 'Snorlax'], 42);


// 1. Initialize Sockets and Apply Mocking (Synchronous Execution)
// FIX 1: Use the imported StateMachine object for its functions:
StateMachine.setPeerRole('HOST');
const hostSocket = initSocket(HOST_PORT, HOST_IP);

// FIX 2: Use the imported StateMachine object for its functions:
StateMachine.setPeerRole('JOINER');
const joinerSocket = initSocket(JOINER_PORT, HOST_IP);

// CRITICAL FIX: Overwrite the exported function *in the module object* itself.
// This ensures that all calls to udpSocketModule.sendPacket get the mock.
udpSocketModule.sendPacket = sendPacketLossMock; 
Logger.log('TEST', 'Packet Loss Mock installed successfully.');


// 2. Initiate Handshake (Host's First Send - Step 1)
setTimeout(() => {
    Logger.log('TEST', '--- STEP 1: Host Initiating Handshake (INIT_SENT) ---');
    
    const handshakeReq = Protocol.createHandshakeRequest(HOST_ID, 42, ['Bulbasaur', 'Venusaur', 'Charizard']);
    
    // Use the global module reference, which now points to the MOCK!
    udpSocketModule.sendPacket(handshakeReq, HOST_IP, JOINER_PORT);
    
    // FIX 3: Use the StateMachine object for the transition function:
    StateMachine.transitionState(StateMachine.CONNECTION_STATES.INIT_SENT);

}, 100); 


// 3. Cleanup and Assertion
setTimeout(() => {
    Logger.log('TEST', '--- CLEANUP & FINAL STATUS CHECK ---');
    
    // Restore the original function and close sockets cleanly
    udpSocketModule.sendPacket = originalSendPacket; 
    closeSocket();
}, 3500); // Gives time for the retransmission cycle to complete.


// $env:VERBOSE_MODE="true"; node test_full_handshake.js