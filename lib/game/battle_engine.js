// lib/game/battle_engine.js

const Logger = require('../utils/logger');
const Protocol = require('../protocol').default;
const GameState = require('./game_state');
const BattleCalculator = require('./battle_calculator');
const NEService = require('../network/udp_socket');

// Stores announced moves during the PROCESSING_TURN phase
const turnMoves = {
    host: null,
    joiner: null,
};

/**
 * The core logic for the Turn-Based loop. Executes independently on both peers
 * after both have announced their moves. It runs damage calculation and prepares 
 * the CALCULATION_REPORT.
 * * @param {string} localRole - 'host' or 'joiner'.
 * @returns {void}
 */
function processTurn(localRole) {
    const state = GameState.getGameState();
    
    if (state.statePhase !== 'PROCESSING_TURN') {
        Logger.error('GM-ENGINE', `Attempted to process turn in wrong phase: ${state.statePhase}`);
        return;
    }

    // Determine Attack Order (Simplified: Host always goes first)
    const firstAttackerRole = 'host';
    const secondAttackerRole = 'joiner';

    const turnResults = [];
    
    // --- 1. HOST ATTACKS FIRST ---
    executeAttackPhase(firstAttackerRole, secondAttackerRole, turnResults);

    // --- 2. JOINER ATTACKS SECOND (ONLY IF NOT FAINTED) ---
    if (GameState.checkIfFainted(state[secondAttackerRole].activePokemonName, state)) {
        Logger.log('GM-ENGINE', `${state[secondAttackerRole].activePokemonName} fainted. Skipping second attack.`);
    } else {
        executeAttackPhase(secondAttackerRole, firstAttackerRole, turnResults);
    }

    // --- 3. FINAL STATE UPDATE & MESSAGE SENDING (The Report Checksum) ---

    // Note: The state remains 'PROCESSING_TURN' until CALCULATION_CONFIRM is received.
    
    // Check for GAME_OVER after turn execution
    if (GameState.checkGameOver(state)) {
        Logger.log('GM-ENGINE', 'GAME OVER detected! Sending GAME_OVER message (not yet fully implemented).');
        // TODO: Send GAME_OVER message here.
        // const winnerRole = (state.host.activePokemon.currentHp > 0) ? 'host' : 'joiner';
        // NEService.sendPacket(Protocol.createGameOverMessage(state.gameId, state[winnerRole].peerId), remoteIP, remotePort);
    }
    
    // Send CALCULATION_REPORT to opponent
    const remoteIP = state.opponentIP || '127.0.0.1'; 
    const remotePort = state.opponentPort || (localRole === 'host' ? 5021 : 5020);

    const reportMessage = Protocol.createCalculationReportMessage(state.gameId, turnResults);
    
    NEService.sendPacket(reportMessage, remoteIP, remotePort);
    Logger.log('GM-ENGINE', `SENT CALCULATION_REPORT (Total results: ${turnResults.length})`);
    
    // Clear moves for next turn
    turnMoves.host = null;
    turnMoves.joiner = null;
}

/**
 * Executes a single attack phase, calculates damage, and updates the local state.
 * Adds the result to the shared results array for the CALCULATION_REPORT.
 * * @param {string} attackerRole - 'host' or 'joiner'.
 * @param {string} defenderRole - 'host' or 'joiner'.
 * @param {Array<Object>} resultsArray - The array to push the turn result object into.
 * @returns {void}
 */
function executeAttackPhase(attackerRole, defenderRole, resultsArray) {
    const state = GameState.getGameState();
    const attackerState = state[attackerRole];
    const defenderState = state[defenderRole];
    const moveData = turnMoves[attackerRole]; 
    
    if (!moveData) {
        Logger.warn('GM-ENGINE', `No move data found for ${attackerRole}. Skipping attack.`);
        return;
    }

    // Pass the active Pokémon state object and the move data to the calculator
    const damage = BattleCalculator.calculateDamage(attackerState, defenderState, moveData);

    // Apply damage and update HP
    defenderState.activePokemon.currentHp -= damage;
    defenderState.activePokemon.currentHp = Math.max(0, defenderState.activePokemon.currentHp);
    
    Logger.log('GM-ENGINE', 
        `${attackerState.activePokemon.name} hit ${defenderState.activePokemon.name} for ${damage} damage. HP: ${defenderState.activePokemon.currentHp}`
    );

    // If fainted, trigger switch
    if (defenderState.activePokemon.currentHp <= 0) {
        Logger.log('GM-ENGINE', `${defenderState.activePokemon.name} fainted!`);
    }

    // Record result for the report message (RFC-compliant)
    const result = {
        attacker: attackerState.activePokemon.name, 
        move_used: moveData.name,
        remaining_health: attackerState.activePokemon.currentHp, 
        damage_dealt: damage,
        defender_hp_remaining: defenderState.activePokemon.currentHp,
        status_message: `${attackerState.activePokemon.name} used ${moveData.name}!`,
    };
    resultsArray.push(result);
}


/**
 * Handles an incoming ATTACK_ANNOUNCE message from a peer. If the local peer 
 * is the defender, it sends a DEFENSE_ANNOUNCE and checks if the turn can start.
 * * @param {Object} message - The decoded ATTACK_ANNOUNCE message.
 * @param {string} localRole - The role of the local peer ('host' or 'joiner').
 * @param {string} remoteIP - The remote peer's IP.
 * @param {number} remotePort - The remote peer's port.
 * @returns {void}
 */
function handleAttackAnnounce(message, localRole, remoteIP, remotePort) {
    const state = GameState.getGameState();
    const senderRole = (localRole === 'host' ? 'joiner' : 'host');
    const moveName = message.move_name;
    
    const moveData = GameState.getMove(moveName);

    if (!moveData) {
        Logger.error('GM-ENGINE', `Received unknown move: '${moveName}' from ${senderRole}. Ignoring.`);
        return;
    }

    moveData.name = moveName;
    turnMoves[senderRole] = moveData;
    Logger.log('GM-ENGINE', `Received ATTACK_ANNOUNCE from ${senderRole}: ${moveName}`);

    // 1. If this peer is the DEFENDER, send the DEFENSE_ANNOUNCE immediately.
    if (state.statePhase === 'WAITING_FOR_MOVE') { 
        const defenseMsg = Protocol.createDefenseAnnounceMessage(state.gameId, 'READY');
        NEService.sendPacket(defenseMsg, remoteIP, remotePort);
        Logger.log('GM-ENGINE', `SENT DEFENSE_ANNOUNCE to ${senderRole}.`);
    }

    // 2. Check if both moves are ready to proceed to the Calculation Phase
    if (turnMoves.host && turnMoves.joiner) {
        state.statePhase = 'PROCESSING_TURN';
        Logger.log('GM-ENGINE', 'Both moves announced. Starting turn processing...');
        processTurn(localRole);
    } else {
        Logger.log('GM-ENGINE', `Waiting for move from ${turnMoves.host ? 'joiner' : 'host'}.`);
    }
}

/**
 * Handles an incoming DEFENSE_ANNOUNCE message. This is confirmation that the 
 * opponent received our ATTACK_ANNOUNCE. The attacker then checks if the turn 
 * can transition to processing.
 * * @param {Object} message - The decoded DEFENSE_ANNOUNCE message.
 * @param {string} localRole - The role of the local peer ('host' or 'joiner').
 * @param {string} remoteIP - The remote peer's IP.
 * @param {number} remotePort - The remote peer's port.
 * @returns {void}
 */
function handleDefenseAnnounce(message, localRole, remoteIP, remotePort) {
    const state = GameState.getGameState();
    
    if (state.statePhase !== 'WAITING_FOR_MOVE') {
        Logger.warn('GM-ENGINE', 'Received DEFENSE_ANNOUNCE in unexpected state. Ignoring.');
        return;
    }
    
    Logger.log('GM-ENGINE', 'Received DEFENSE_ANNOUNCE. Opponent is ready.');
    
    // Check if the opponent's move (which should have arrived via ATTACK_ANNOUNCE) 
    // and our own move are both ready.
    if (turnMoves.host && turnMoves.joiner) {
        state.statePhase = 'PROCESSING_TURN';
        Logger.log('GM-ENGINE', 'Starting turn processing after receiving DEFENSE_ANNOUNCE...');
        processTurn(localRole);
    }
}

/**
 * Handles an incoming CALCULATION_REPORT message. This is the checksum phase, 
 * where local calculation is compared against the opponent's report.
 * * @param {Object} message - The decoded CALCULATION_REPORT message.
 * @param {string} localRole - The role of the local peer.
 * @param {string} remoteIP - The remote peer's IP.
 * @param {number} remotePort - The remote peer's port.
 * @returns {void}
 */
function handleCalculationReport(message, localRole, remoteIP, remotePort) {
    const state = GameState.getGameState();
    
    if (state.statePhase !== 'PROCESSING_TURN') {
        Logger.warn('GM-ENGINE', 'Received CALCULATION_REPORT in unexpected state. Ignoring.');
        return;
    }

    const opponentRole = (localRole === 'host' ? 'joiner' : 'host');
    const localOpponentHP = state[opponentRole].activePokemon.currentHp;
    const opponentReportedHP = message.results[message.results.length - 1].defender_hp_remaining;
    
    let discrepancyDetected = false;
    
    // Check for discrepancy in the final HP value
    if (opponentReportedHP !== localOpponentHP) {
        discrepancyDetected = true;
        Logger.error('GM-ENGINE', 
            `DISCREPANCY DETECTED! Local HP for opponent: ${localOpponentHP}. Opponent reported: ${opponentReportedHP}.`
        );
    }

    // Action based on check
    if (discrepancyDetected) {
        // Send RESOLUTION_REQUEST (RFC 4.9)
        const resolutionMsg = Protocol.createResolutionRequestMessage(state.gameId, message.results); 
        NEService.sendPacket(resolutionMsg, remoteIP, remotePort);
        Logger.log('GM-ENGINE', 'SENT RESOLUTION_REQUEST.');
        
    } else {
        // MATCH: Send CALCULATION_CONFIRM (RFC 4.8)
        const confirmMsg = Protocol.createCalculationConfirmMessage(state.gameId, state.turn);
        NEService.sendPacket(confirmMsg, remoteIP, remotePort);
        Logger.log('GM-ENGINE', 'SENT CALCULATION_CONFIRM. Waiting for opponent...');
    }
}

/**
 * Handles an incoming CALCULATION_CONFIRM message. This signals the final
 * synchronization point, officially ending the turn and incrementing the turn counter.
 * * @param {Object} message - The decoded CALCULATION_CONFIRM message.
 * @param {string} localRole - The role of the local peer.
 * @param {string} remoteIP - The remote peer's IP.
 * @param {number} remotePort - The remote peer's port.
 * @returns {void}
 */
function handleCalculationConfirm(message, localRole, remoteIP, remotePort) {
    const state = GameState.getGameState();
    
    // Check for GAME OVER (though this should have been checked in processTurn)
    if (GameState.checkGameOver(state)) {
        // TODO: Send GAME_OVER message here if the opponent hasn't already.
        return;
    }

    // Turn officially ends: transition to the next turn's state.
    state.turn += 1;
    state.statePhase = 'WAITING_FOR_MOVE'; 
    Logger.log('GM-ENGINE', `Turn synchronized. Transitioning to Turn ${state.turn}. Phase: ${state.statePhase}`);
}


module.exports = {
    processTurn,
    handleAttackAnnounce,
    handleDefenseAnnounce, 
    handleCalculationReport,
    handleCalculationConfirm,
};