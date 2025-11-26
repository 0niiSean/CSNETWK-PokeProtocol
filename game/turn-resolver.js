/**
 * File: game/turn-resolver.js
 * Purpose: Handles the execution of a single turn (damage application, health update), 
 * and performs the critical synchronization check (CALCULATION_REPORT comparison).
 */

import * as GameState from './battle-state.js';
import * as DamageCalculator from './damage-calculator.js';
import * as NetworkClient from '../network/p2p-client.js';
import { getNextSequenceNumber } from '../network/reliability.js';
import { 
    createCalculationReportMessage, 
    createCalculationConfirmMessage, 
    createResolutionRequestMessage,
    createGameOverMessage,
    createDefenseAnnounceMessage
} from '../protocol/message-creators.js';
import { MESSAGE_TYPES, RELIABILITY_FIELDS, BATTLE_FIELDS } from '../protocol/constants.js';
import * as Logger from '../utils/logger.js';
import { generateRandomModifier } from '../utils/rng.js'; 
import * as StateMachine from './state-machine.js'; 
import { CONNECTION_STATES } from './state-machine.js'; // Imported for transition

// Placeholder for a simple move data structure (for demonstration)
const MOCK_MOVESET = {
    'Thunderbolt': { name: 'Thunderbolt', type: 'electric', category: 'special', base_power: 90 },
    'Tackle': { name: 'Tackle', type: 'normal', category: 'physical', base_power: 40 },
};

// --- Local state storage for the turn currently being resolved ---
let activeTurnContext = {};

// ====================================================================
// SECTION 1: CORE TURN EXECUTION
// ====================================================================

/**
 * Stores the context of the attack initiated by the local peer.
 */
export function setActiveTurn(moveName) {
    const state = GameState.getBattleState();
    activeTurnContext = {
        attackerRole: state.local.pokemonName, // Local player is the attacker
        moveName: moveName,
        remoteIP: state.remoteIP,
        remotePort: state.remotePort,
        localResult: null 
    };
}

/**
 * Handles the calculation sequence when DEFENSE_ANNOUNCE is received (Attacking Peer).
 * Mirrors routeAttack() for consistency.
 */
export function routeDefense() {
    const state = GameState.getBattleState();
    
    // Attacker must calculate damage when they receive DEFENSE_ANNOUNCE
    const localResult = performLocalCalculation(state.local.pokemonName, activeTurnContext.moveName);
    activeTurnContext.localResult = localResult;
    
    // Send our CALCULATION_REPORT
    sendCalculationReport(localResult, activeTurnContext.remoteIP, activeTurnContext.remotePort);
    
    // This will print a log confirming the attacker has calculated and sent their report.
    Logger.log('Resolver', `Defense received. Sent CALCULATION_REPORT. Waiting for opponent's report.`);
}

/**
 * Executes the defense/calculation sequence when ATTACK_ANNOUNCE is received (Defending Peer).
 * @param {Object} attackMessage - The decoded ATTACK_ANNOUNCE message.
 */
export function routeAttack(attackMessage) {
    const state = GameState.getBattleState();
    const { remoteIP, remotePort, move_name } = attackMessage;
    
    // 1. Store the context of the incoming attack
    activeTurnContext = { 
        attackerRole: state.opponent.pokemonName, // Opponent is the attacker
        moveName: move_name,
        remoteIP: remoteIP,
        remotePort: remotePort,
        localResult: null
    };
    
    // 2. CRITICAL: Send DEFENSE_ANNOUNCE immediately (RFC 4.6)
    sendDefenseAnnounce(remoteIP, remotePort);
    
    // 3. Immediately calculate damage (Defender must be ready to report)
    const localResult = performLocalCalculation(state.opponent.pokemonName, move_name);
    activeTurnContext.localResult = localResult;
    
    // 4. Send our CALCULATION_REPORT (RFC 4.7)
    sendCalculationReport(localResult, remoteIP, remotePort);
    
    // This will print a log indicating the sequence of events initiated upon receiving an attack.
    Logger.log('Resolver', `Defense/Calculation initiated for Turn ${state.turn}. Sent DEFENSE_ANNOUNCE and CALCULATION_REPORT.`);
}

/**
 * Sends the DEFENSE_ANNOUNCE message to signal readiness. (RFC 4.6)
 * @param {string} remoteIP - Opponent IP.
 * @param {number} remotePort - Opponent port.
 */
export function sendDefenseAnnounce(remoteIP, remotePort) {
    const seqNum = getNextSequenceNumber();
    const defenseMessage = createDefenseAnnounceMessage(seqNum);
    
    NetworkClient.sendGameCommand(defenseMessage, remoteIP, remotePort);
    // This will print a log confirming the DEFENSE_ANNOUNCE was sent with its sequence number.
    Logger.log('Resolver', `Sent DEFENSE_ANNOUNCE (Seq: ${seqNum}).`);
    
    // --- LOG FORMAT COMPLIANCE (RFC 4.6) ---
    // This will print the raw, compliant log entry for the DEFENSE_ANNOUNCE message.
    console.log(`\nmessage_type: DEFENSE_ANNOUNCE\nsequence_number: ${seqNum}\n`);
}

/**
 * Sends the local calculation report to the opponent (RFC 4.7).
 */
export function sendCalculationReport(calculationResult, remoteIP, remotePort) {
    const seqNum = getNextSequenceNumber();
    const reportMessage = createCalculationReportMessage(
        seqNum,
        calculationResult.attackerName,
        calculationResult.moveUsed,
        calculationResult.remainingHealth,
        calculationResult.damageDealt,
        calculationResult.defenderHpRemaining,
        calculationResult.statusMessage
    );

    NetworkClient.sendGameCommand(reportMessage, remoteIP, remotePort);
    
    // --- LOG FORMAT COMPLIANCE (RFC 4.7) ---
    // This will print the raw, compliant log entry for the CALCULATION_REPORT message, including damage and HP remaining.
    console.log(`\nmessage_type: CALCULATION_REPORT\nattacker: ${calculationResult.attackerName}\nmove_used: ${calculationResult.moveUsed}\nremaining_health: ${calculationResult.remainingHealth}\ndamage_dealt: ${calculationResult.damageDealt}\ndefender_hp_remaining: ${calculationResult.defenderHpRemaining}\nstatus_message: ${calculationResult.statusMessage}\nsequence_number: ${seqNum}\n`);
}

// ====================================================================
// SECTION 2: CALCULATION CORE & SYNCHRONIZATION CHECK
// ====================================================================

/**
 * Performs the actual damage calculation based on local state.
 */
function performLocalCalculation(attackerName, moveName) {
    const state = GameState.getBattleState();
    const isLocalAttacker = state.local.pokemonName === attackerName;
    
    const attackerMon = isLocalAttacker ? state.local : state.opponent;
    const defenderMon = isLocalAttacker ? state.opponent : state.local;
    const move = MOCK_MOVESET[moveName];
    
    if (!move) {
        // This will print an error if the move used by the attacker is not defined in the mock moveset.
        Logger.error('Resolver', `Move ${moveName} not found.`);
        return null;
    }

    const isBoosted = false; 
    let rawDamage = DamageCalculator.calculateDamage(attackerMon, defenderMon, move, isBoosted);
    
    const randomModifier = generateRandomModifier();
    let finalDamage = Math.floor(rawDamage * randomModifier);

    if (finalDamage === 0 && rawDamage > 0) {
        finalDamage = 1;
    }

    const newDefenderHP = Math.max(0, defenderMon.currentHP - finalDamage);
    const newAttackerHP = attackerMon.currentHP; 
    
    // --- Custom Status Message for Log Compliance ---
    let statusMsg = `${attackerMon.pokemonName} used ${moveName}!`;
    if (finalDamage > 0) {
        statusMsg += ` It dealt ${finalDamage} damage.`;
    } else {
         statusMsg += ` It had no effect.`;
    }

    return {
        attackerName: attackerMon.pokemonName,
        moveUsed: moveName,
        damageDealt: finalDamage,
        defenderHpRemaining: newDefenderHP,
        remainingHealth: newAttackerHP,
        statusMessage: statusMsg,
    };
}


/**
 * Handles the comparison of the opponent's CALCULATION_REPORT against the local result (RFC 5.2, Step 3).
 */
export function processCalculationReport(message) {
    const localResult = activeTurnContext.localResult;
    if (!localResult) {
         // This will print an error if the local result is missing when a report is received.
         Logger.error('Resolver', 'Local calculation result missing! Cannot sync turn.');
         return;
    }
    
    const remoteDamage = Number(message[BATTLE_FIELDS.DAMAGE_DEALT]);
    const remoteDefenderHP = Number(message[BATTLE_FIELDS.DEFENDER_HP_REMAINING]);
    
    const localDamage = localResult.damageDealt;
    const localDefenderHP = localResult.defenderHpRemaining;
    
    // --- 1. Synchronization Check ---
    const damageMatches = (remoteDamage === localDamage);
    const hpMatches = (remoteDefenderHP === localDefenderHP);

    if (damageMatches && hpMatches) {
        // --- MATCH CONFIRMED ---
        // This will print a log confirming the local and remote calculation reports matched.
        Logger.log('Resolver', 'Calculation match confirmed. Sending CONFIRM.');
        
        // 2. Update Local State & Check for Game Over
        applyTurnResults(localResult);
        
        // 3. Send CALCULATION_CONFIRM (RFC 4.8)
        sendCalculationConfirm(activeTurnContext.remoteIP, activeTurnContext.remotePort);
        
        // 4. Final transition to next turn or GAME_OVER
        checkGameOverAndTransition(localResult);

    } else {
        // --- MISMATCH DETECTED ---
        // This will print a warning detailing the mismatch between local and remote damage values.
        Logger.warn('Resolver', `Calculation Mismatch Detected! Local Damage: ${localDamage}, Remote Damage: ${remoteDamage}`);
        
        // 2. Send RESOLUTION_REQUEST (RFC 4.9)
        sendResolutionRequest(localResult, activeTurnContext.remoteIP, activeTurnContext.remotePort);
    }
}

/** Sends the CALCULATION_CONFIRM message. */
function sendCalculationConfirm(remoteIP, remotePort) {
    const seqNum = getNextSequenceNumber();
    const confirmMessage = createCalculationConfirmMessage(seqNum);
    NetworkClient.sendGameCommand(confirmMessage, remoteIP, remotePort);

    // --- LOG FORMAT COMPLIANCE (RFC 4.8) ---
    // This will print the raw, compliant log entry for the CALCULATION_CONFIRM message.
    console.log(`\nmessage_type: CALCULATION_CONFIRM\nsequence_number: ${seqNum}\n`);
}

/** Sends the RESOLUTION_REQUEST message. */
function sendResolutionRequest(localResult, remoteIP, remotePort) {
    const seqNum = getNextSequenceNumber();
    const resMessage = createResolutionRequestMessage(
        seqNum,
        localResult.attackerName,
        localResult.moveUsed,
        localResult.damageDealt,
        localResult.defenderHpRemaining
    );
    NetworkClient.sendGameCommand(resMessage, remoteIP, remotePort);

    // --- LOG FORMAT COMPLIANCE (RFC 4.9) ---
    // This will print the raw, compliant log entry for the RESOLUTION_REQUEST message.
    console.log(`\nmessage_type: RESOLUTION_REQUEST\nattacker: ${localResult.attackerName}\nmove_used: ${localResult.moveUsed}\ndamage_dealt: ${localResult.damageDealt}\ndefender_hp_remaining: ${localResult.defenderHpRemaining}\nsequence_number: ${seqNum}\n`);
}

/** Applies damage and checks for game end. */
function checkGameOverAndTransition(result) {
    const state = GameState.getBattleState();
    
    // Check if the opponent fainted AFTER damage application
    if (state.opponent.currentHP === 0) {
        sendGameOver(state.local.pokemonName, state.opponent.pokemonName, state.remoteIP, state.remotePort);
    } else {
        // If game continues, advance the turn counter and signal State Machine
        GameState.advanceTurn(); 
        StateMachine.transitionState(CONNECTION_STATES.WAITING_FOR_MOVE);
    }
}

/** Applies the calculated damage to the local battle state (used after sync confirmed). */
function applyTurnResults(result) {
    const state = GameState.getBattleState();
    const defenderRole = result.attackerName === state.local.pokemonName ? 'opponent' : 'local';
    
    // Apply damage to the correct target (opponent in this context)
    if (defenderRole === 'opponent') {
        state.opponent.currentHP = result.defenderHpRemaining;
    } else {
        state.local.currentHP = result.defenderHpRemaining; // Should not happen if local initiated the attack
    }
    
    // This will print a log showing the updated HP for both the local and opponent Pokémon after damage is applied.
    Logger.log('Resolver', `Applied Damage. ${state.local.pokemonName} HP: ${state.local.currentHP}, ${state.opponent.pokemonName} HP: ${state.opponent.currentHP}`);
}


/** Sends the GAME_OVER message when the opponent's health hits zero (RFC 4.10). */
function sendGameOver(winnerName, loserName, remoteIP, remotePort) {
    const seqNum = getNextSequenceNumber();
    const gameOverMessage = createGameOverMessage(seqNum, winnerName, loserName);
    NetworkClient.sendGameCommand(gameOverMessage, remoteIP, remotePort);
    StateMachine.transitionState(CONNECTION_STATES.GAME_OVER);

    // --- LOG FORMAT COMPLIANCE (RFC 4.10) ---
    // This will print the raw, compliant log entry for the GAME_OVER message.
    console.log(`message_type: GAME_OVER\nwinner: ${winnerName}\nloser: ${loserName}\nsequence_number: ${seqNum}\n`);
    // This will print a final log confirming the end of the battle and the winner.
    Logger.log('Resolver', `--- BATTLE END: GAME_OVER sent. ${winnerName} wins. ---`);
}