/**
 * File: game/battle-manager.js
 * Purpose: Manages battle state and communicates with Electron renderer
 */

import * as GameState from './battle-state.js';
import * as StateMachine from './state-machine.js';
import * as TurnResolver from './turn-resolver.js';
import * as P2PClient from '../network/p2p-client.js';
import * as P2PServer from '../network/p2p-server.js';
import * as UDPSocket from '../network/udp-socket.js';
import * as Logger from '../utils/logger.js';

// Store reference to Electron window for sending updates
let mainWindow = null;

/**
 * Initialize the battle manager with Electron window reference
 */
export function initialize(window) {
    mainWindow = window;
}

/**
 * Send update to renderer process
 */
function sendToRenderer(channel, data) {
    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send(channel, data);
    }
}

/**
 * Start a battle session
 */
export function startBattle(role, remoteIP, remotePort) {
    const localPort = role === 'HOST' ? 8000 : 8001;
    const localPokemon = role === 'HOST' ? 'Charizard' : 'Pikachu';
    
    // Initialize UDP socket with custom router
    UDPSocket.initializeSocket(localPort, handleApplicationMessage);

    // Initialize game state
    GameState.initializeState(localPokemon, 5, 5, 0, remoteIP, remotePort);
    StateMachine.setPeerRole(role);
    
    // Send initial state to renderer
    sendToRenderer('battle-update', {
        type: 'init',
        yourPokemon: localPokemon,
        yourHP: GameState.getBattleState().local.currentHP,
        yourMaxHP: GameState.getBattleState().local.currentHP
    });
    
    // Start connection based on role
    if (role === 'HOST') {
        sendToRenderer('log', { message: 'Waiting for opponent to connect...', type: 'system' });
    } else {
        P2PClient.initiateJoinerHandshake(remoteIP, remotePort);
        StateMachine.transitionState(StateMachine.CONNECTION_STATES.INIT_SENT);
        sendToRenderer('log', { message: 'Connecting to host...', type: 'system' });
    }
}

/**
 * Handle incoming network messages
 */
function handleApplicationMessage(message) {
    const role = StateMachine.getPeerRole();
    
    // Route to P2P server for host-specific messages
    if (role === 'HOST' && 
        (message.message_type === 'HANDSHAKE_REQUEST' || 
         message.message_type === 'SPECTATOR_REQUEST')) {
        P2PServer.routeServerPacket(message);
        return;
    }
    
    // Route to state machine
    StateMachine.routeApplicationPacket(message);
    
    // Send updates to renderer based on message type
    handleMessageForRenderer(message);
    
    // Check if game is over after processing
    const state = GameState.getBattleState();
    if (StateMachine.getConnectionState() === StateMachine.CONNECTION_STATES.GAME_OVER) {
        // Determine winner based on HP
        const youWon = state.local.currentHP > 0;
        const winner = youWon ? state.local.pokemonName : state.opponent.pokemonName;
        const loser = youWon ? state.opponent.pokemonName : state.local.pokemonName;
        
        sendToRenderer('game-over', { winner, loser });
        sendToRenderer('log', { 
            message: `Battle ended! ${winner} wins!`, 
            type: 'system' 
        });
    }
}
/**
 * Convert network messages to renderer updates
 */
function handleMessageForRenderer(message) {
    const state = GameState.getBattleState();
    
    switch (message.message_type) {
        case 'HANDSHAKE_RESPONSE':
            sendToRenderer('log', { message: 'Connected! Exchanging battle data...', type: 'system' });
            break;
            
        case 'BATTLE_SETUP':
            sendToRenderer('battle-update', {
                type: 'setup',
                opponentPokemon: state.opponent.pokemonName,
                opponentHP: state.opponent.currentHP,
                opponentMaxHP: state.opponent.currentHP,
                yourHP: state.local.currentHP,
                yourMaxHP: state.local.currentHP
            });
            
            if (StateMachine.getConnectionState() === StateMachine.CONNECTION_STATES.WAITING_FOR_MOVE) {
                const isYourTurn = StateMachine.getPeerRole() === 'HOST';
                sendToRenderer('turn-update', { isYourTurn });
                sendToRenderer('log', { 
                    message: isYourTurn ? 'Battle started! Your turn!' : 'Battle started! Waiting for opponent...', 
                    type: 'system' 
                });
            }
            break;
            
        case 'ATTACK_ANNOUNCE':
            sendToRenderer('log', { 
                message: `${state.opponent.pokemonName} is attacking!`, 
                type: 'normal' 
            });
            break;
            
        case 'CALCULATION_REPORT':
            const damage = message.damage_dealt;
            const attacker = message.attacker;
            
            sendToRenderer('log', { 
                message: `${attacker} used ${message.move_used}! Dealt ${damage} damage!`, 
                type: 'normal' 
            });
            
            // Update HP
            sendToRenderer('battle-update', {
                type: 'damage',
                yourHP: state.local.currentHP,
                yourMaxHP: state.local.baseStats.hp,
                opponentHP: state.opponent.currentHP,
                opponentMaxHP: state.opponent.baseStats.hp
            });
            break;
            
        case 'CALCULATION_CONFIRM':
            // Turn advances
            const nextTurn = StateMachine.getConnectionState() === StateMachine.CONNECTION_STATES.WAITING_FOR_MOVE;
            if (nextTurn) {
                const isYourTurn = (state.turn % 2 === 1) === (StateMachine.getPeerRole() === 'HOST');
                sendToRenderer('turn-update', { isYourTurn });
            }
            break;
            
        case 'GAME_OVER':
            sendToRenderer('game-over', {
                winner: message.winner,
                loser: message.loser
            });
            sendToRenderer('log', { 
                message: `Battle ended! ${message.winner} wins!`, 
                type: 'system' 
            });
            break;
    }
}

/**
 * Execute an attack move
 */
export async function executeAttack(moveName) {
    const state = GameState.getBattleState();
    
    // Store move context
    TurnResolver.setActiveTurn(moveName);
    
    // Create and send attack announce
    const { getNextSequenceNumber } = await import('../network/reliability.js');
    const seqNum = getNextSequenceNumber();
    
    const attackMessage = {
        message_type: 'ATTACK_ANNOUNCE',
        sequence_number: seqNum,
        move_name: moveName
    };
    
    P2PClient.sendGameCommand(attackMessage, state.remoteIP, state.remotePort);
    StateMachine.transitionState(StateMachine.CONNECTION_STATES.PROCESSING_TURN);
    
    sendToRenderer('log', { message: `You used ${moveName}!`, type: 'normal' });
}