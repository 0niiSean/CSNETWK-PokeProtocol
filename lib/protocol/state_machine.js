// lib/protocol/state_machine.js

const Protocol = require('./index').default; 
const Logger = require('../utils/logger'); 

// Connection States Definition
const CONNECTION_STATES = {
    DISCONNECTED: 0,
    INIT_SENT: 1,       // Host sends HANDSHAKE_REQUEST, waiting for response
    RESP_RECEIVED: 2,   // Joiner receives HANDSHAKE_REQUEST, sends HANDSHAKE_RESPONSE
    CONNECTED: 4,       // Connection is established and ready for BATTLE_SETUP
    SPECTATING: 5,
};

let connectionState = CONNECTION_STATES.DISCONNECTED;
let peerRole = null; // Stored here: 'HOST' or 'JOINER'

function transitionState(newState) {
    if (newState === connectionState) return; 
    Logger.log('PA-SM', `STATE CHANGE: ${getConnectionStateName()} -> ${getConnectionStateName(newState)}`);
    connectionState = newState;
}

function setPeerRole(role) {
    peerRole = role.toUpperCase();
    Logger.log('PA-SM', `ROLE SET: ${peerRole}`);
}

function handleHandshakePacket(message, sendResponse) {
    const type = message.message_type;

    // --- State Transition Logic ---
    switch (type) {
        // Case 1: Joiner receives the initial request
        case Protocol.MESSAGE_TYPES.HANDSHAKE_REQUEST:
            if (peerRole === 'JOINER' && connectionState === CONNECTION_STATES.DISCONNECTED) {
                Logger.log('PA-SM', 'Processing Handshake Request...');
                
                // 1. Generate response payload (PA delegates content creation to GM/main app)
                const responseMessage = Protocol.createHandshakeResponse(
                    'JOINER_ID', ['Pikachu', 'Gengar', 'Snorlax']
                ); 
                
                // 2. Send response back to the Host (NE handles sendPacket)
                sendResponse(responseMessage, message.remoteIP, message.remotePort);
                transitionState(CONNECTION_STATES.RESP_RECEIVED);
            }
            break;

        // Case 2: Host receives the response
        case Protocol.MESSAGE_TYPES.HANDSHAKE_RESPONSE:
            if (peerRole === 'HOST' && connectionState === CONNECTION_STATES.INIT_SENT) {
                Logger.log('PA-SM', 'Received Handshake Response. Connection successful!');
                transitionState(CONNECTION_STATES.CONNECTED);
                
                // NOTE: Host must now send BATTLE_SETUP (GM's job)
            }
            break;
            
        // Case 3: Either peer receives a disconnect
        case Protocol.MESSAGE_TYPES.DISCONNECT:
            transitionState(CONNECTION_STATES.DISCONNECTED);
            break;

        // Case 4: Receiving a Spectator Request
        case Protocol.MESSAGE_TYPES.SPECTATOR_REQUEST:
            if (connectionState === CONNECTION_STATES.DISCONNECTED) {
                Logger.log('PA-SM', 'Received SPECTATOR_REQUEST. Setting role and sending ACK.');
                
                // 1. Transition to SPECTATING state immediately
                transitionState(CONNECTION_STATES.SPECTATING);
                
                // 2. Send a generic acknowledgment/status update
                const ackMessage = {
                    message_type: Protocol.MESSAGE_TYPES.ACK, 
                    // This ACK confirms receipt, the data stream confirms spectator status
                    ack_number: message[Protocol.RELIABILITY_FIELDS.SEQUENCE_NUMBER], 
                };
                sendResponse(ackMessage, message.remoteIP, message.remotePort); 
            }
            break;
    }
}

function getConnectionStateName(state = connectionState) {
    return Object.keys(CONNECTION_STATES).find(key => CONNECTION_STATES[key] === state) || 'UNKNOWN';
}

module.exports = {
    CONNECTION_STATES,
    transitionState,
    setPeerRole,
    handleHandshakePacket,
    getConnectionState: () => connectionState,
    getConnectionStateName,
    peerRole: () => peerRole // Export getter for current role
};