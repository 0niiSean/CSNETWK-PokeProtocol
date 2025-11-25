/**
 * File: game/state-machine.js
 * Purpose: Manages the battle's overall state and flow, orchestrating the transitions 
 * between phases (SETUP, WAITING_FOR_MOVE, PROCESSING_TURN) as required by RFC Section 5.2.
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
    // This will print the transition from the current state to the new state.
    Logger.log('SM', `STATE CHANGE: ${connectionState} -> ${newState}`);
    connectionState = newState;
}

export function setPeerRole(role) {
    peerRole = role.toUpperCase();
    // This will print the determined role of the current peer (HOST or JOINER).
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
        // This will print a warning if a HANDSHAKE_RESPONSE is received outside the expected INIT_SENT state.
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
    // This will print confirmation that the handshake is complete and setup exchange is beginning.
    Logger.log('SM', `Handshake complete. Entering setup exchange.`);
}

/**
 * Handles incoming BATTLE_SETUP messages from the opponent (used by both HOST and JOINER).
 */
export function handleBattleSetup(message) {
    // 1. Update GameState with opponent's chosen Pokemon and stat_boosts.
    GameState.setOpponentSetup(message);

    const remoteIP = message.remoteIP;
    const remotePort = message.remotePort;
    const role = getPeerRole();

    // 2. SEQUENCED SEND FIX: Host replies to Joiner's BATTLE_SETUP to complete the 2-way exchange.
    if (role === 'HOST' && connectionState !== CONNECTION_STATES.SETUP_EXCHANGING) {
             
        // This will print a log indicating the Host is sending its setup data in response to the Joiner.
        Logger.log('SM', 'Host received Joiner setup. Sending Host setup now to complete handshake.');
        NetworkClient.sendBattleSetup(GameState.getLocalSetupData(), remoteIP, remotePort);
        
        // Transition Host to SETUP_EXCHANGING state 
        transitionState(CONNECTION_STATES.SETUP_EXCHANGING);
    }
    
    // 3. Final Check for transition to ready state.
    if (GameState.isSetupComplete()) {
        transitionState(CONNECTION_STATES.WAITING_FOR_MOVE);
        
        // Host goes first. 
        if (role === 'HOST') {
            // This will print a log telling the Host peer that it is their turn to move.
            Logger.log('SM', `Setup complete. It is your turn (Host).`);
        } else {
            // This will print a log telling the Joiner peer that they must wait for the Host's move.
            Logger.log('SM', `Setup complete. Waiting for Host's move.`);
        }
    }
}


// ====================================================================
// SECTION 3: TURN MANAGEMENT ROUTERS (RFC 5.2)
// ====================================================================

/**
 * Handles ATTACK_ANNOUNCE from the opponent (Defending Peer's role). (RFC 5.2, Step 2)
 * @param {Object} message - Decoded ATTACK_ANNOUNCE message.
 */
export function handleAttackAnnounce(message) {
    if (connectionState !== CONNECTION_STATES.WAITING_FOR_MOVE) {
        // This will print a warning if an ATTACK_ANNOUNCE is received outside the expected state.
        Logger.warn('SM', 'Ignoring ATTACK_ANNOUNCE, not in WAITING_FOR_MOVE state.');
        return;
    }
    
    // 1. Transition state to processing the attack
    transitionState(CONNECTION_STATES.PROCESSING_TURN);
    
    // 2. CRITICAL FIX: The Turn Resolver handles the full sequence: DEFENSE -> CALCULATION -> REPORT.
    TurnResolver.routeAttack(message);
    
    // This will print a log confirming the attack was received and the full defense/calculation/report sequence was initiated.
    Logger.log('SM', 'Attack received. Sent DEFENSE_ANNOUNCE and CALCULATION_REPORT. Waiting for opponent confirmation.');
}

/**
 * Handles DEFENSE_ANNOUNCE from the opponent (Attacking Peer's role). (RFC 5.2, Step 2)
 * This message is sent after the Defender receives the attack and confirms readiness.
 */
export function handleDefenseAnnounce(message) {
    if (connectionState !== CONNECTION_STATES.PROCESSING_TURN) {
        // This will print a warning if a DEFENSE_ANNOUNCE is received outside the expected state.
        Logger.warn('SM', 'Ignoring DEFENSE_ANNOUNCE, unexpected state.');
        return;
    }
    
    // CRITICAL: The Attacker now runs its calculation immediately after receiving DEFENSE_ANNOUNCE.
    // TurnResolver.calculateAndReportAttacker(); // Placeholder to show Attacker calculation here.
    
    // This will print a log confirming the defense announcement was received and calculation/reporting is beginning.
    Logger.log('SM', 'Received DEFENSE_ANNOUNCE. Proceeding to calculation (Sending CALCULATION_REPORT)...');
}

/**
 * Handles CALCULATION_REPORT from the opponent (Used by both peers). (RFC 5.2, Step 3)
 */
export function handleCalculationReport(message) {
    if (connectionState !== CONNECTION_STATES.PROCESSING_TURN) {
        // This will print a warning if a CALCULATION_REPORT is received outside the expected state.
        Logger.warn('SM', 'Ignoring CALCULATION_REPORT, unexpected state.');
        return;
    }
    
    // Route to the resolver for comparison, confirmation, or resolution request
    TurnResolver.processCalculationReport(message);
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
        case MESSAGE_TYPES.DEFENSE_ANNOUNCE: // <-- NEW HANDLER
            handleDefenseAnnounce(message);
            break;
        case MESSAGE_TYPES.CALCULATION_REPORT:
            handleCalculationReport(message);
            break;
            
        case MESSAGE_TYPES.GAME_OVER:
            transitionState(CONNECTION_STATES.GAME_OVER);
            // This will print the winner of the battle upon receiving a GAME_OVER message.
            Logger.log('SM', `BATTLE ENDED: ${message.winner} wins!`);
            break;

        default:
            // This will print a warning if the router receives a message type it does not have a handler for.
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