// joiner_app.js

const readline = require('readline');
const NEService = require('./lib/network/udp_socket');
const GameState = require('./lib/game/game_state');
const Protocol = require('./lib/protocol').default;
const StateMachine = require('./lib/protocol/state_machine');
const Logger = require('./lib/utils/logger');

// --- CONFIGURATION ---
const JOINER_PORT = 5021; 
const JOINER_PEER_ID = 'JOINER_USER_B';
const JOINER_POKEMON_NAME = 'Bulbasaur'; // 1v1 setup

// Placeholder data for state machine to use when responding to handshake
// These need to be accessible by GameState for initialization in state_machine.js
GameState.getJoinerId = () => JOINER_PEER_ID;
GameState.getJoinerTeam = () => [JOINER_POKEMON_NAME];


const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function startJoiner() {
    Logger.log('APP-JOINER', 'Starting Joiner Application...');

    // 1. Initialize data and socket
    GameState.loadPokemonData();
    NEService.initSocket(JOINER_PORT);
    StateMachine.setPeerRole('JOINER');
    
    Logger.log('APP-JOINER', `Listening on port ${JOINER_PORT}. Waiting for HOST handshake...`);
    
    // 2. Start the main input loop
    rl.on('line', (input) => handleUserInput(input.trim()));
}

function handleUserInput(input) {
    const state = GameState.getGameState();

    // Check if it's the Joiner's turn (Turn 2, 4, 6, etc.) and waiting for move.
    if (state && state.statePhase === 'WAITING_FOR_MOVE' && state.turn % 2 === 0) { 
        const moveName = input;
        
        if (GameState.validateMove(state, moveName)) {
            // Update local state and send ATTACK_ANNOUNCE
            const announceMsg = Protocol.createAttackAnnounceMessage(state.gameId, moveName);
            NEService.sendPacket(announceMsg, state.opponentIP, state.opponentPort);

            // Store move data for processTurn (Joiner is ATTACKER this turn)
            const moveData = GameState.getMove(moveName);
            moveData.name = moveName;
            StateMachine.turnMoves.joiner = moveData; 

            Logger.log('APP-JOINER', `SENT ATTACK_ANNOUNCE: ${moveName}. Waiting for DEFENSE_ANNOUNCE...`);
        } else {
            Logger.warn('APP-JOINER', `Invalid move: ${input}. Try one of: ${Object.keys(state.joiner.activePokemon.moveset).join(', ')}`);
        }
    } else if (state) {
        Logger.log('APP-JOINER', `Not your turn, or in phase: ${state.statePhase}. Current Turn: ${state.turn}`);
    } else {
        Logger.warn('APP-JOINER', 'Battle not yet initialized. Waiting for Host.');
    }
}

startJoiner().catch(err => {
    Logger.error('APP-JOINER', 'Application crashed:', err);
    NEService.closeSocket();
    process.exit(1);
});