const Protocol = require('./index').default; 
const Logger = require('../utils/logger'); 
const GameState = require('../game/game_state');
const NEService = require('../network/udp_socket');

// ====================================================================
// SECTION 1: STATE DEFINITIONS AND CORE MUTATORS
// ====================================================================

/**
 * @typedef {Object} CONNECTION_STATES
 * @property {number} DISCONNECTED - Initial state.
 * @property {number} INIT_SENT - Host sent HANDSHAKE_REQUEST, waiting for response.
 * @property {number} RESP_RECEIVED - Handshake complete, waiting for/sending BATTLE_SETUP.
 * @property {number} SETUP_SENT - Peer has sent BATTLE_SETUP data.
 * @property {number} CONNECTED - Both peers have exchanged BATTLE_SETUP and are ready for turn 1.
 * @property {number} SPECTATING - Connected as an observer only.
 */
const CONNECTION_STATES = {
    DISCONNECTED: 0,
    INIT_SENT: 1, 
    RESP_RECEIVED: 2,
    SETUP_SENT: 3, 
    CONNECTED: 4, 
    SPECTATING: 5,
};

let connectionState = CONNECTION_STATES.DISCONNECTED;
let peerRole = null; // Stored here: 'HOST' or 'JOINER'
let opponentIP = null; // Cached IP address of the opponent
let opponentPort = null; // Cached port of the opponent

/**
 * Transitions the connection state and logs the change.
 * @param {number} newState - The target state value (from CONNECTION_STATES).
 * @returns {void}
 */
function transitionState(newState) {
    if (newState === connectionState) return; 
    Logger.log('PA-SM', `STATE CHANGE: ${getConnectionStateName()} -> ${getConnectionStateName(newState)}`);
    connectionState = newState;
}

/**
 * Assigns the local peer's role ('HOST' or 'JOINER').
 * @param {string} role - The role string (e.g., 'host', 'joiner').
 * @returns {void}
 */
function setPeerRole(role) {
    peerRole = role.toUpperCase();
    Logger.log('PA-SM', `ROLE SET: ${peerRole}`);
}

/**
 * Retrieves the human-readable name of a connection state.
 * @param {number} [state=connectionState] - The state value to look up.
 * @returns {string} The state name.
 */
function getConnectionStateName(state = connectionState) {
    return Object.keys(CONNECTION_STATES).find(key => CONNECTION_STATES[key] === state) || 'UNKNOWN';
}

// ====================================================================
// SECTION 2: HANDSHAKE AND INITIAL SETUP HANDLERS
// ====================================================================

/**
 * Primary handler for initial connection messages (HANDSHAKE_REQUEST, RESPONSE, etc.).
 * This function synchronizes the game state and initiates the BATTLE_SETUP phase.
 * @param {Object} message - The decoded message object.
 * @param {string} localRole - The role of the local peer ('HOST' or 'JOINER'). <--- ADDED & NAMED
 * @param {function(Object, string, number): void} sendResponse - Function to send a response packet.
 * @returns {void}
 */
function handleHandshakePacket(message, localRole, sendResponse) { // <-- CORRECTED SIGNATURE
    const type = message.message_type;
    
    // Cache remote connection details for future packet sending
    opponentIP = message.remoteIP;
    opponentPort = message.remotePort;
    
    // Pass opponent details to GameState if initialized
    const state = GameState.getGameState();
    if (state) {
        state.opponentIP = opponentIP;
        state.opponentPort = opponentPort;
    }

    switch (type) {
        // --- 1. JOINER RECEIVES REQUEST (Initial Contact) ---
        case Protocol.MESSAGE_TYPES.HANDSHAKE_REQUEST:
            if (peerRole === 'JOINER' && connectionState === CONNECTION_STATES.DISCONNECTED) {
                Logger.log('PA-SM', 'Processing Handshake Request...');
                
                // 1. Extract and lock-in Host data
                const hostId = message[Protocol.HANDSHAKE_FIELDS.PEER_ID];
                const hostTeam = message[Protocol.HANDSHAKE_FIELDS.TEAM_PREVIEW];
                const seed = message[Protocol.HANDSHAKE_FIELDS.SEED];
                const receivedSequenceNumber = message[Protocol.RELIABILITY_FIELDS.SEQUENCE_NUMBER];
                
                // NOTE: Joiner's local configuration (ID/Team) is assumed to be defined by the app layer.
                const joinerId = 'JOINER_USER_B'; 
                const joinerTeam = ['Pikachu']; 

                // 2. Initialize the full Battle State (GM: sets initial HP, teams, seed)
                GameState.initializeState(hostId, hostTeam, joinerId, joinerTeam, seed);
                
                // 3. Send HANDSHAKE_RESPONSE (Acknowledging the request)
                const responseMessage = Protocol.createHandshakeResponse(
                    joinerId, 
                    joinerTeam,
                    seed,
                    receivedSequenceNumber 
                ); 
                
                sendResponse(responseMessage, message.remoteIP, message.remotePort); // <-- FIXED
                transitionState(CONNECTION_STATES.RESP_RECEIVED);
                
                // 4. Immediately send BATTLE_SETUP (Starting the game configuration)
                GameState.sendBattleSetup('joiner', message.remoteIP, message.remotePort); // <-- FIXED
                transitionState(CONNECTION_STATES.SETUP_SENT);
            }
            break;

        // --- 2. HOST RECEIVES RESPONSE (Connection Confirmation) ---
        case Protocol.MESSAGE_TYPES.HANDSHAKE_RESPONSE:
            if (peerRole === 'HOST' && connectionState === CONNECTION_STATES.INIT_SENT) {
                Logger.log('PA-SM', 'Received Handshake Response. Connection successful!');
                
                // --- 1. Extract and finalize Joiner data ---
                const joinerId = message[Protocol.HANDSHAKE_FIELDS.PEER_ID];
                const joinerTeam = message[Protocol.HANDSHAKE_FIELDS.TEAM_PREVIEW];
                const seed = message[Protocol.HANDSHAKE_FIELDS.SEED];

                // Re-initialize state with finalized opponent data and seed.
                const hostState = GameState.getGameState();
                GameState.initializeState(hostState.host.peerId, [hostState.host.activePokemonName], joinerId, joinerTeam, seed);

                // --- 1. CRITICAL DEADLOCK FIX: Process Piggybacked ACK ---
                const ne = require('../network/udp_socket'); // Require NE locally if not globally available
                const ackNumFromJoiner = message[Protocol.RELIABILITY_FIELDS.ACK_NUMBER];
                
                // **This call forces the buffer to clear Packet #1, breaking the Host's retransmission loop.**
                // This simulates the direct ACK processing logic.
                ne.handleAck({ ack_number: ackNumFromJoiner });
                
                // --- 2. ACK Joiner's Packet #1 (Handshake Response) ---
                // This stops the Joiner's retransmission timer, preventing the deadlock.
                const joinerSequenceNumber = message[Protocol.RELIABILITY_FIELDS.SEQUENCE_NUMBER];
                const ackMessage = Protocol.createAckMessage(joinerSequenceNumber);
                
                // CRITICAL FIX: Explicitly send the ACK using the core sendPacket function
                const { sendPacket } = require('../network/udp_socket'); 
                sendPacket(ackMessage, message.remoteIP, message.remotePort); 

                // --- 3. Send BATTLE_SETUP (Host's half of the setup exchange) ---
                GameState.sendBattleSetup('host', message.remoteIP, message.remotePort);
                
                // --- 4. Final State Transition ---
                // The handshake is complete, and BATTLE_SETUP is sent. 
                // The connection is logically ready to receive the opponent's SETUP.
                transitionState(CONNECTION_STATES.SETUP_SENT);
            }
            break;
            
        // --- 3. CONNECTION/CONTROL MESSAGES ---
        case Protocol.MESSAGE_TYPES.DISCONNECT:
            transitionState(CONNECTION_STATES.DISCONNECTED);
            Logger.log('PA-SM', 'DISCONNECT received. Closing socket.');
            NEService.closeSocket();
            break;

        case Protocol.MESSAGE_TYPES.SPECTATOR_REQUEST:
            if (connectionState === CONNECTION_STATES.DISCONNECTED) {
                Logger.log('PA-SM', 'Received SPECTATOR_REQUEST. Entering observation mode.');
                transitionState(CONNECTION_STATES.SPECTATING);
                // Note: ACK handled by the NE router before this function is called.
            }
            break;

        case Protocol.MESSAGE_TYPES.BATTLE_SETUP:
            GameState.handleBattleSetup(decodedMessage, localRole);
            
            // CRITICAL TRANSITION: Check if the peer that received SETUP has also SENT setup.
            if (StateMachine.getConnectionState() === StateMachine.CONNECTION_STATES.SETUP_SENT) {
                StateMachine.transitionState(StateMachine.CONNECTION_STATES.CONNECTED);
            }
            break;
    }
}


// ====================================================================
// FINAL EXPORTS
// ====================================================================

module.exports = {
    CONNECTION_STATES,
    transitionState,
    setPeerRole,
    handleHandshakePacket,
    getConnectionState: () => connectionState,
    getConnectionStateName,
    peerRole: () => peerRole // Export getter for current role
};