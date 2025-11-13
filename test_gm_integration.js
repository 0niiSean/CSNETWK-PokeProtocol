// test_gm_integration.js
const { initSocket } = require('./lib/network/udp_socket');
const { loadPokemonData, initializeState, sendMockMove } = require('./lib/game/game_state');
const Protocol = require('./lib/protocol').default;

// --- STEP 1: Data Setup ---
console.log('--- STEP 1: Initializing Game Master Data ---');
loadPokemonData(); // Load data from the generated JSON

// --- STEP 2: Network Setup ---
// Start sockets for Host (5000) and Joiner (5001) in the same process 
// to ensure the ACK logic immediately responds to the Host.
const hostPort = 5000;
const joinerPort = 5001;

initSocket(hostPort); 
initSocket(joinerPort, '127.0.0.1'); // Bind Joiner explicitly if running both locally

// --- STEP 3: Game State Setup ---
const hostTeam = ['Bulbasaur', 'Venusaur', 'Charizard']; 
const joinerTeam = ['Pikachu', 'Gengar', 'Snorlax'];    
const SEED = 42;

const initialState = initializeState(
    'Host-ID-1', 
    hostTeam, 
    'Joiner-ID-2', 
    joinerTeam, 
    SEED
);
console.log(`[GM] Initial State Ready. Game ID: ${initialState.gameId}, Turn: ${initialState.turn}`);

// --- STEP 4: Mock Mnode test_gm_integration.jsove (Integration Test) ---
// The Host chooses a mock move and sends it to the Joiner's port (5001)

setTimeout(() => {
    console.log('\n--- STEP 4: Host Sends Mock Move (Integration) ---');
    const hostMove = 'Flamethrower'; // Mock move
    
    // This calls GM.sendMockMove, which calls NE.sendPacket, which uses PA.encode
    sendMockMove('host', hostMove, '127.0.0.1', joinerPort); 
    
    // The Joiner's listener (on('message')) receives the packet and sends an ACK back to the Host (5000)
    // The Host will receive this ACK, proving the round trip.
}, 2000);