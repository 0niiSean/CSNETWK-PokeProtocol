/**
 * File: index.js
 * Purpose: Main application entry point. Initializes the socket, assigns the peer role (HOST/JOINER),
 * and links the Network Layer (UDP Socket) to the Application Router (Game State Machine).
 */

// --- UTILITIES & CONSTANTS ---
import * as Logger from './utils/logger.js';
import * as RNG from './utils/rng.js';
import * as GameState from './game/battle-state.js';
import { MESSAGE_TYPES, BATTLE_FIELDS, RELIABILITY_FIELDS } from './protocol/constants.js'; 

// --- NETWORK LAYER ---
import * as UDPSocket from './network/udp-socket.js';
import * as P2PClient from './network/p2p-client.js';
import * as P2PServer from './network/p2p-server.js';
import * as Reliability from './network/reliability.js';

// --- GAME LOGIC LAYER ---
import * as StateMachine from './game/state-machine.js';
import { CONNECTION_STATES } from './game/state-machine.js'; // <-- CRITICAL FIX: Importing the state object
import * as TurnResolver from './game/turn-resolver.js';
import { sendChat } from './game/chat-overlay.js';

// Node.js standard libraries for command-line input
import * as readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const PEER_ID = `Peer-${Math.floor(Math.random() * 10000)}`;
const DEFAULT_PORT = 8000;

// ====================================================================
// SECTION 1: APPLICATION ROUTER (Links Network to Game State)
// ====================================================================

function applicationRouter(message) {
    const role = StateMachine.getPeerRole();
    const state = GameState.getBattleState();
    
    // 1. Initial Connection Handlers (Host role logic routes requests to P2PServer)
    if (role === 'HOST' && (message.message_type === MESSAGE_TYPES.HANDSHAKE_REQUEST || message.message_type === MESSAGE_TYPES.SPECTATOR_REQUEST)) {
        P2PServer.routeServerPacket(message);
        return;
    }
    
    // 2. Chat Handler (Asynchronous - RFC 5.2 Step 4)
    if (message.message_type === MESSAGE_TYPES.CHAT_MESSAGE) {
        // ChatOverlay.handleIncomingChat(message); 
        return; 
    }
    
    // 3. Game Flow Handler (Forward everything else to the State Machine)
    StateMachine.routeApplicationPacket(message);
    
    // After any application packet, check if the Host should now proceed with the turn.
    if (StateMachine.getConnectionState() === CONNECTION_STATES.WAITING_FOR_MOVE) {
        // If it's my turn (Host always starts, then turns alternate)
        if (role === (state.turn % 2 === 1 ? 'HOST' : 'JOINER')) {
            // Re-prompt the user if they were waiting for the state machine to return.
            process.stdout.write('> ');
        }
    }
}

// ====================================================================
// SECTION 2: COMMAND LINE INTERFACE & STARTUP
// ====================================================================

/**
 * Handles user input for attacks and chat.
 * @param {string} input - User input from the console.
 */
function handleUserInput(input) {
    const state = GameState.getBattleState();
    const currentState = StateMachine.getConnectionState();

    // Check for exit
    if (input.toLowerCase() === 'exit') {
        UDPSocket.closeSocket();
        rl.close();
        return;
    }

    if (currentState === CONNECTION_STATES.WAITING_FOR_MOVE) {
        const moveName = input.trim();
        
        // --- Input Validation and Execution ---
        if (state.local.pokemonName && state.remoteIP) {
            
            // Placeholder: Check if the move is valid/available here
            if (moveName === 'Thunderbolt' || moveName === 'Tackle') {
                
                // 1. Get sequence number (THIS LINE IS NOW RESOLVED)
                const seqNum = Reliability.getNextSequenceNumber(); 
                
                // 2. Create Attack Announce message
                const attackMessage = {
                    message_type: MESSAGE_TYPES.ATTACK_ANNOUNCE, 
                    [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: seqNum, 
                    move_name: moveName
                };

                // 3. Send via P2PClient (reliable transmission)
                P2PClient.sendGameCommand(attackMessage, state.remoteIP, state.remotePort);
                
                // 4. Transition locally to processing state while waiting for DEFENSE_ANNOUNCE
                StateMachine.transitionState(CONNECTION_STATES.PROCESSING_TURN);
                console.log(`[Input] Executed move: ${moveName}. Waiting for opponent response...`);

            } else {
                console.log(`[Error] Invalid move: ${moveName}. Available: Thunderbolt, Tackle.`);
            }
        }
    } else if (currentState !== CONNECTION_STATES.GAME_OVER) {
        console.log(`[Status] Please wait, currently in ${currentState}.`);
    }
    
    // Resume prompt if still in waiting state
    if (StateMachine.getConnectionState() === CONNECTION_STATES.WAITING_FOR_MOVE) {
        process.stdout.write('> ');
    }
}


/**
 * Initializes the entire application stack.
 */
function startApp() {
    rl.question('Are you the Host or Joiner? (H/J): ', (roleInput) => {
        const role = roleInput.toUpperCase() === 'H' ? 'HOST' : 'JOINER';
        StateMachine.setPeerRole(role);
        
        const localPort = DEFAULT_PORT + (role === 'HOST' ? 0 : 1);

        // 1. Initialize Logger (Verbose Mode enabled for network debugging)
        Logger.initializeLogger(true);
        
        // 2. Initialize Socket and link the application router
        UDPSocket.initializeSocket(localPort, applicationRouter);

        if (role === 'HOST') {
            handleHostStartup();
        } else {
            handleJoinerStartup();
        }
        
        // Setup persistent command handler
        rl.on('line', handleUserInput);
    });
}

/** Host specific initialization */
function handleHostStartup() {
    const localMonName = "Charizard"; 
    
    // NOTE: Host needs a default local state to start. Seed, IP/Port will be set later.
    // The Host's initial BATTLE_SETUP data (Charizard, boosts) must be ready here.
    GameState.initializeState(localMonName, 5, 5, 0, null, null); 
    
    console.log(`\n--- Host Peer [${PEER_ID}] ---`);
    console.log(`(Port Binding in progress...)`);
    console.log(`Waiting for HANDSHAKE_REQUEST...`);
}

/** Joiner specific initialization */
function handleJoinerStartup() {
    rl.question('Enter Host IP: ', (hostIP) => {
        rl.question('Enter Host Port (default 8000): ', (hostPortInput) => {
            const hostPort = parseInt(hostPortInput) || DEFAULT_PORT;
            const localMonName = "Pikachu";

            // Initialize local state before sending request
            GameState.initializeState(localMonName, 5, 5, 0, hostIP, hostPort); 
            
            console.log(`\n--- Joiner Peer [${PEER_ID}] ---`);
            console.log(`Attempting reliable handshake with ${hostIP}:${hostPort}...`);
            
            // Trigger the reliable handshake initiation (RFC 4.1)
            P2PClient.initiateJoinerHandshake(hostIP, hostPort);
            
            // Update state machine to expect response
            StateMachine.transitionState(CONNECTION_STATES.INIT_SENT);
        });
    });
}


// Start the application
startApp();