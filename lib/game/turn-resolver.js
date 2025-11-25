/**
 * File: game/turn-resolver.js
 * Purpose: Handles the execution of a single turn (damage application, health update), 
 * and performs the critical synchronization check (CALCULATION_REPORT comparison).
 * * Complies with RFC 5.2, Step 3 (Turn Processing State) and RFC 4.9 (Resolution Request).
 */

import * as GameState from './battle-state.js';
import * as DamageCalculator from './damage-calculator.js';
import * as NetworkClient from '../network/p2p-client.js';
import { getNextSequenceNumber } from '../network/reliability.js';
import { 
    createCalculationReportMessage, 
    createCalculationConfirmMessage, 
    createResolutionRequestMessage,
    createGameOverMessage
} from '../protocol/message-creators.js';
import { MESSAGE_TYPES, RELIABILITY_FIELDS, BATTLE_FIELDS } from '../protocol/constants.js';
import * as Logger from '../utils/logger.js';
import { generateRandomModifier } from '../utils/rng.js'; // Use synchronized RNG

// Placeholder for a simple move data structure (for demonstration)
const MOCK_MOVESET = {
    'Thunderbolt': { name: 'Thunderbolt', type: 'electric', category: 'special', base_power: 90 },
    'Tackle': { name: 'Tackle', type: 'normal', category: 'physical', base_power: 40 },
};

/**
 * Executes the attack, calculates raw damage, and generates a CALCULATION_REPORT.
 * This function is called by BOTH the Attacker and the Defender when entering PROCESSING_TURN.
 * @param {Object} message - The initial ATTACK_ANNOUNCE message that triggered the calculation.
 * @param {string} attackerRole - 'local' or 'opponent'.
 * @returns {Object} The local calculation result object.
 */
function performLocalCalculation(attackerRole, moveName) {
    const state = GameState.getBattleState();
    const defenderRole = attackerRole === 'local' ? 'opponent' : 'local';

    const attackerMon = state[attackerRole];
    const defenderMon = state[defenderRole];
    const move = MOCK_MOVESET[moveName];
    
    if (!move) {
        Logger.error('Resolver', `Move ${moveName} not found.`);
        return null;
    }

    // 1. Check for consumable boost usage (if implemented)
    // For simplicity here, we assume no boost is used for automatic calculation.
    const isBoosted = false; 

    // 2. Calculate the damage (using deterministic calculation)
    let rawDamage = DamageCalculator.calculateDamage(attackerMon, defenderMon, move, isBoosted);
    
    // 3. Apply deterministic random modifier (RFC 5.2, Step 1 uses seed for this)
    const randomModifier = generateRandomModifier();
    let finalDamage = Math.floor(rawDamage * randomModifier);

    // Ensure minimum damage is 1 (unless 0 effectiveness)
    if (finalDamage === 0 && rawDamage > 0) {
        finalDamage = 1;
    }

    // 4. Determine new HP (Crucial for synchronization check)
    const newDefenderHP = Math.max(0, defenderMon.currentHP - finalDamage);
    const newAttackerHP = attackerMon.currentHP; // Attacker HP usually unchanged by attack

    // 5. Construct Status Message
    const statusMessage = `${attackerMon.pokemonName} used ${moveName}! It dealt ${finalDamage} damage.`;

    return {
        attackerName: attackerMon.pokemonName,
        moveUsed: moveName,
        damageDealt: finalDamage,
        defenderHpRemaining: newDefenderHP,
        remainingHealth: newAttackerHP, // Attacker's health
        statusMessage: statusMessage,
    };
}


/**
 * Sends the local calculation report to the opponent (RFC 4.7).
 * This acts as the local peer's "checksum" for the turn.
 * @param {Object} calculationResult - The result from performLocalCalculation.
 * @param {string} remoteIP - Opponent IP.
 * @param {number} remotePort - Opponent port.
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
    Logger.log('Resolver', `Sent CALCULATION_REPORT (Seq: ${seqNum}, Damage: ${calculationResult.damageDealt})`);
}

/**
 * Handles the comparison of the opponent's CALCULATION_REPORT against the local result (RFC 5.2, Step 3).
 * @param {Object} message - The opponent's CALCULATION_REPORT message.
 * @param {Object} localResult - The result of the local performLocalCalculation.
 * @param {string} remoteIP - Opponent IP.
 * @param {number} remotePort - Opponent port.
 */
export function processCalculationReport(message, localResult, remoteIP, remotePort) {
    const remoteDamage = message[BATTLE_FIELDS.DAMAGE_DEALT];
    const remoteDefenderHP = message[BATTLE_FIELDS.DEFENDER_HP_REMAINING];
    
    const localDamage = localResult.damageDealt;
    const localDefenderHP = localResult.defenderHpRemaining;
    
    // --- 1. Synchronization Check ---
    const damageMatches = (remoteDamage === localDamage);
    const hpMatches = (remoteDefenderHP === localDefenderHP);

    if (damageMatches && hpMatches) {
        Logger.log('Resolver', 'Calculation match confirmed. Sending CONFIRM.');
        
        // 2. Update Local State & Check for Game Over
        applyTurnResults(localResult);
        
        // 3. Send CALCULATION_CONFIRM (RFC 4.8)
        const confirmSeqNum = getNextSequenceNumber();
        const confirmMessage = createCalculationConfirmMessage(confirmSeqNum);
        NetworkClient.sendGameCommand(confirmMessage, remoteIP, remotePort);
        
        // 4. Check for GAME_OVER (Only the peer whose opponent faints sends this)
        const state = GameState.getBattleState();
        if (state.opponent.currentHP === 0) {
            sendGameOver(state.local.pokemonName, state.opponent.pokemonName, remoteIP, remotePort);
        } else {
            // If game continues, advance the turn counter
            GameState.advanceTurn(); 
            // Signal the State Machine to move back to WAITING_FOR_MOVE
            // Placeholder: StateMachine.transitionState(CONNECTION_STATES.WAITING_FOR_MOVE);
        }

    } else {
        Logger.warn('Resolver', `Calculation Mismatch Detected! Local Damage: ${localDamage}, Remote Damage: ${remoteDamage}`);
        
        // 2. Send RESOLUTION_REQUEST (RFC 4.9)
        const resSeqNum = getNextSequenceNumber();
        const resMessage = createResolutionRequestMessage(
            resSeqNum,
            localResult.attackerName,
            localResult.moveUsed,
            localResult.damageDealt,
            localResult.defenderHpRemaining
        );
        NetworkClient.sendGameCommand(resMessage, remoteIP, remotePort);
        // Note: The battle halts until the resolution is resolved by the Game State Machine.
    }
}

/**
 * Applies the calculated damage to the local battle state (used after sync confirmed).
 */
function applyTurnResults(result) {
    const state = GameState.getBattleState();
    const defenderRole = result.attackerName === state.local.pokemonName ? 'opponent' : 'local';
    
    if (defenderRole === 'opponent') {
        state.opponent.currentHP = result.defenderHpRemaining;
    } else {
        state.local.currentHP = result.defenderHpRemaining;
    }
    
    Logger.log('Resolver', `Applied Damage. ${state.local.pokemonName} HP: ${state.local.currentHP}, ${state.opponent.pokemonName} HP: ${state.opponent.currentHP}`);
}


/**
 * Sends the GAME_OVER message when the opponent's health hits zero (RFC 4.10).
 */
function sendGameOver(winnerName, loserName, remoteIP, remotePort) {
    const seqNum = getNextSequenceNumber();
    const gameOverMessage = createGameOverMessage(seqNum, winnerName, loserName);
    NetworkClient.sendGameCommand(gameOverMessage, remoteIP, remotePort);
    // Placeholder: StateMachine.transitionState(CONNECTION_STATES.GAME_OVER);
    Logger.log('Resolver', `--- BATTLE END: GAME_OVER sent. ${winnerName} wins. ---`);
}