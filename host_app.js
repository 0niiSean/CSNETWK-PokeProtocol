// host_app.js

const readline = require('readline');
const NEService = require('./lib/network/udp_socket');
const GameState = require('./lib/game/game_state');
const Protocol = require('./lib/protocol').default;
const StateMachine = require('./lib/protocol/state_machine');
const Logger = require('./lib/utils/logger');

// --- CONFIGURATION ---
const HOST_PORT = 5020;
const JOINER_PORT = 5021; // The port the Joiner is listening on
const JOINER_IP = '127.0.0.1'; 
const HOST_PEER_ID = 'HOST_USER_A';
const HOST_POKEMON_NAME = 'Charmander'; // 1v1 setup

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function startHost() {
    Logger.log('APP-HOST', 'Starting Host Application...');
    
    // 1. Initialize data and socket
    GameState.loadPokemonData();
    NEService.initSocket(HOST_PORT);
    StateMachine.setPeerRole('HOST');

    // 2. Prepare local state and send HANDSHAKE_REQUEST
    const SEED = Math.floor(Math.random() * 10000); 
    const hostTeam = [HOST_POKEMON_NAME];

    // Initialize state locally before sending (needs placeholder for Joiner)
    GameState.initializeState(HOST_PEER_ID, hostTeam, 'JOINER_PENDING', ['Pikachu'], SEED);

    const requestMessage = Protocol.createHandshakeRequest(HOST_PEER_ID, SEED, hostTeam);
    
    NEService.sendPacket(requestMessage, JOINER_IP, JOINER_PORT);
    StateMachine.transitionState(StateMachine.CONNECTION_STATES.INIT_SENT);

    Logger.log('APP-HOST', `Sent HANDSHAKE_REQUEST to ${JOINER_IP}:${JOINER_PORT}. Waiting for response...`);
    
    // 3. Start the main input loop
    rl.on('line', (input) => handleUserInput(input.trim()));
}

function handleUserInput(input) {
    const state = GameState.getGameState();
    
    // Check if it's the Host's turn (Turn 1, 3, 5, etc.) and waiting for move.
    if (state && state.statePhase === 'WAITING_FOR_MOVE' && state.turn % 2 !== 0) {
        const moveName = input;
        
        if (GameState.validateMove(state, moveName)) {
            // Update local state and send ATTACK_ANNOUNCE
            const announceMsg = Protocol.createAttackAnnounceMessage(state.gameId, moveName);
            NEService.sendPacket(announceMsg, state.opponentIP, state.opponentPort);

            // Store move data for processTurn (Host is ATTACKER this turn)
            const moveData = GameState.getMove(moveName);
            moveData.name = moveName;
            StateMachine.turnMoves.host = moveData; 

            Logger.log('APP-HOST', `SENT ATTACK_ANNOUNCE: ${moveName}. Waiting for DEFENSE_ANNOUNCE...`);
        } else {
            Logger.warn('APP-HOST', `Invalid move: ${input}. Try one of: ${Object.keys(state.host.activePokemon.moveset).join(', ')}`);
        }
    } else if (state) {
        Logger.log('APP-HOST', `Not your turn, or in phase: ${state.statePhase}. Current Turn: ${state.turn}`);
    } else {
        Logger.warn('APP-HOST', 'Battle not yet initialized.');
    }
}

startHost().catch(err => {
    Logger.error('APP-HOST', 'Application crashed:', err);
    NEService.closeSocket();
    process.exit(1);
});