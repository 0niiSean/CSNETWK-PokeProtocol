/**
 * File: game/state-machine.js
 * Purpose: Manages the battle's overall state and flow, orchestrating the transitions 
 * between phases (SETUP, WAITING_FOR_MOVE, PROCESSING_TURN) as required by RFC Section 5.2.
 * * Implements the sequenced two-way BATTLE_SETUP flow to ensure stability over UDP.
 */

import { MESSAGE_TYPES, RELIABILITY_FIELDS, BATTLE_FIELDS } from '../protocol/constants.js'; 
import * as Logger from '../utils/logger.js';
import * as NetworkClient from '../network/p2p-client.js'; 
import * as GameState from './battle-state.js'; 
import * as TurnResolver from './turn-resolver.js'; 
import * as RNG from '../utils/rng.js'; 

// ====================================================================
// SECTION 1: STATE DEFINITIONS (RFC 5.2)
// ====================================================================

export const CONNECTION_STATES = {
    DISCONNECTED: 'DISCONNECTED',
    INIT_SENT: 'INIT_SENT',
    SETUP_EXCHANGING: 'SETUP_EXCHANGING', // Both peers are sending/receiving BATTLE_SETUP.
    WAITING_FOR_MOVE: 'WAITING_FOR_MOVE',
    PROCESSING_TURN: 'PROCESSING_TURN',
    GAME_OVER: 'GAME_OVER',
    SPECTATING: 'SPECTATING',
};

let connectionState = CONNECTION_STATES.DISCONNECTED;
let peerRole = null; // 'HOST' or 'JOINER'

export function transitionState(newState) {
    if (newState === connectionState) return; 
    Logger.log('SM', `STATE CHANGE: ${connectionState} -> ${newState}`);
    connectionState = newState;
}

export function setPeerRole(role) {
    peerRole = role.toUpperCase();
    Logger.log('SM', `ROLE SET: ${peerRole}`);
}

// ====================================================================
// SECTION 2: HANDSHAKE & INITIAL SETUP ROUTERS
// ====================================================================

/**
 * Handles the initial Handshake responses from the Host Peer (JOINER side).
 */
export function handleHandshakeResponse(message) {
    if (connectionState !== CONNECTION_STATES.INIT_SENT) {
        Logger.warn('SM', `Ignoring HANDSHAKE_RESPONSE, unexpected state: ${connectionState}`);
        return;
    }
    
    // 1. Extract critical sync data
    const seed = message[BATTLE_FIELDS.SEED];
    const remoteIP = message.remoteIP;
    const remotePort = message.remotePort;

    // 2. Initialize global state with the synchronized seed and initialize RNG.
    const localMonName = GameState.getBattleState().local.pokemonName;
    GameState.initializeState(localMonName, 5, 5, seed, remoteIP, remotePort); 
    RNG.initializeRNG(seed);

    // 3. Begin the setup exchange phase
    transitionState(CONNECTION_STATES.SETUP_EXCHANGING);

    // 4. CRITICAL: JOINER sends its BATTLE_SETUP immediately upon receiving the HOST's response.
    NetworkClient.sendBattleSetup(GameState.getLocalSetupData(), remoteIP, remotePort);
    Logger.log('SM', `Handshake complete. Entering setup exchange.`);
}

/**
 * Handles incoming BATTLE_SETUP messages from the opponent (used by both HOST and JOINER).
 * This function performs the sequenced data exchange: Host receives Joiner Setup -> Host sends Host Setup.
 * @param {Object} message - Decoded BATTLE_SETUP message.
 */
export function handleBattleSetup(message) {
    // 1. Update GameState with opponent's chosen Pokemon and stat_boosts.
    GameState.setOpponentSetup(message);

    const remoteIP = message.remoteIP;
    const remotePort = message.remotePort;
    const role = getPeerRole();

    // 2. SEQUENCED SEND FIX: If we are the HOST and we receive BATTLE_SETUP, we must reply with ours.
    // The Host will always execute this because it transitions to SETUP_EXCHANGING 
    // immediately upon receiving the HANDSHAKE_REQUEST in the p2p-server.js logic.
    if (role === 'HOST' && connectionState !== CONNECTION_STATES.SETUP_EXCHANGING) {
         
        Logger.log('SM', 'Host received Joiner setup. Sending Host setup now to complete handshake.');
        NetworkClient.sendBattleSetup(GameState.getLocalSetupData(), remoteIP, remotePort);
        
        // Transition Host to SETUP_EXCHANGING state (now both peers are exchanging)
        transitionState(CONNECTION_STATES.SETUP_EXCHANGING);
    }
    
    // 3. Final Check for transition to ready state.
    // This check runs after receiving opponent's setup AND (if HOST) after sending our setup.
    if (GameState.isSetupComplete()) {
        transitionState(CONNECTION_STATES.WAITING_FOR_MOVE);
        
        // Host goes first. 
        if (role === 'HOST') {
            Logger.log('SM', `Setup complete. It is your turn (Host).`);
        } else {
            Logger.log('SM', `Setup complete. Waiting for Host's move.`);
        }
    }
}


// ====================================================================
// SECTION 3: TURN MANAGEMENT ROUTERS (RFC 5.2)
// ====================================================================

/**
 * Handles ATTACK_ANNOUNCE from the opponent (Defending Peer's role).
 * @param {Object} message - Decoded ATTACK_ANNOUNCE message.
 */
export function handleAttackAnnounce(message) {
    if (connectionState !== CONNECTION_STATES.WAITING_FOR_MOVE) {
        Logger.warn('SM', 'Ignoring ATTACK_ANNOUNCE, not in WAITING_FOR_MOVE state.');
        return;
    }
    
    transitionState(CONNECTION_STATES.PROCESSING_TURN);
    
    // Perform local damage calculation and send CALCULATION_REPORT.
    // TurnResolver.routeAttack(message);
}

/**
 * Handles CALCULATION_REPORT from the opponent (Used by both peers).
 * @param {Object} message - Decoded CALCULATION_REPORT message.
 */
export function handleCalculationReport(message) {
    if (connectionState !== CONNECTION_STATES.PROCESSING_TURN) {
        Logger.warn('SM', 'Ignoring CALCULATION_REPORT, unexpected state.');
        return;
    }
    
    // Route to the resolver for comparison, confirmation, or resolution request
    // TurnResolver.processCalculationReport(message);
}

// ====================================================================
// SECTION 4: MAIN ROUTER (Used by UDP Socket)
// ====================================================================

/**
 * Main application router called by the UDP Socket module.
 * Directs incoming application messages to the appropriate handler.
 * @param {Object} message - The decoded message object (includes remoteIP/remotePort).
 */
export function routeApplicationPacket(message) {
    if (message.message_type === MESSAGE_TYPES.CHAT_MESSAGE) {
        // ChatOverlay.handleIncomingChat(message);
        return; 
    }

    switch (message.message_type) {
        case MESSAGE_TYPES.HANDSHAKE_RESPONSE:
            handleHandshakeResponse(message);
            break;
        case MESSAGE_TYPES.BATTLE_SETUP:
            handleBattleSetup(message);
            break;
        
        case MESSAGE_TYPES.ATTACK_ANNOUNCE:
            handleAttackAnnounce(message);
            break;
        case MESSAGE_TYPES.CALCULATION_REPORT:
            handleCalculationReport(message);
            break;
            
        case MESSAGE_TYPES.GAME_OVER:
            transitionState(CONNECTION_STATES.GAME_OVER);
            Logger.log('SM', `BATTLE ENDED: ${message.winner} wins!`);
            break;

        default:
            Logger.warn('SM', `Received unhandled message type: ${message.message_type}`);
    }
}

// ====================================================================
// SECTION 5: PUBLIC ACCESSORS
// ====================================================================

export function getConnectionState() {
    return connectionState;
}

export function getPeerRole() {
    return peerRole;
}