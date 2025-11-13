// lib/game/game_state.js

const path = require('path');
const fs = require('fs');

const Protocol = require('../protocol').default; 
const NEService = require('../network/udp_socket'); 

// --- STATE MANAGEMENT ---

let allPokemonData = {}; 
let currentState = null;

// --- UTILITY: Load Data (CRITICAL THURSDAY TASK) ---

/**
 * Loads the processed Pokémon data from the JSON file into memory.
 */
function loadPokemonData() {
    try {
        const filePath = path.join(__dirname, 'pokemon_data.json');
        const rawData = fs.readFileSync(filePath, 'utf8');
        
        const dataArray = JSON.parse(rawData);
        
        // Convert the array of Pokémon objects into a dictionary keyed by name
        allPokemonData = dataArray.reduce((acc, pokemon) => {
            // Ensure the name key is correct (case-sensitive!)
            acc[pokemon.name] = pokemon;
            return acc;
        }, {});
        
        console.log(`[GM] Loaded ${Object.keys(allPokemonData).length} Pokémon data entries.`);
    } catch (error) {
        console.error("[GM] CRITICAL ERROR: Could not load pokemon_data.json.", error.message);
        process.exit(1);
    }
}

// --- UTILITY: Team Validation ---

/**
 * Validates a list of Pokémon names and converts them into state objects.
 * @param {Array<string>} teamNames - Array of 3 Pokémon names selected by the user.
 * @returns {Array<Object>} Array of initialized Pokémon objects for the team.
 */
function validateTeam(teamNames) {
    if (!allPokemonData || Object.keys(allPokemonData).length === 0) {
        throw new Error("[GM] Data not loaded. Cannot validate team.");
    }
    if (!teamNames || teamNames.length !== 3) {
        throw new Error("[GM] Team must contain exactly 3 Pokémon.");
    }

    const team = [];
    for (const name of teamNames) {
        const baseStats = allPokemonData[name];
        if (!baseStats) {
            throw new Error(`[GM] Invalid Pokémon selected: ${name}`);
        }
        
        // Defines the state object for the battle
        team.push({
            name: name,
            currentHp: baseStats.hp, 
            baseStats: baseStats,
            status: null, 
        });
    }

    return team;
}

// --- UTILITY: State Initialization (FRIDAY TASK) ---

/**
 * Initializes the central BattleState object.
 * @param {string} hostPeerId - Peer ID of the Host.
 * @param {Array<string>} hostTeamNames - Host's selected team names.
 * @param {string} joinerPeerId - Peer ID of the Joiner.
 * @param {Array<string>} joinerTeamNames - Joiner's selected team names.
 * @param {number} seed - Agreed-upon random seed.
 * @returns {Object} The newly created BattleState object.
 */
function initializeState(hostPeerId, hostTeamNames, joinerPeerId, joinerTeamNames, seed) {
    const hostTeam = validateTeam(hostTeamNames);
    const joinerTeam = validateTeam(joinerTeamNames);

    currentState = {
        gameId: `GAME_${Date.now()}`,
        turn: 1, 
        statePhase: 'WAITING_FOR_MOVE',
        seed: seed,
        pokemonData: allPokemonData, 
        host: {
            peerId: hostPeerId,
            team: hostTeam,
            activePokemonName: hostTeam[0].name, 
            statBoosts: { sp_attack_uses: 0, sp_defense_uses: 0 },
            lastMove: null,
        },
        joiner: {
            peerId: joinerPeerId,
            team: joinerTeam,
            activePokemonName: joinerTeam[0].name,
            statBoosts: { sp_attack_uses: 0, sp_defense_uses: 0 },
            lastMove: null,
        },
    };

    return currentState;
}

// --- UTILITY: Game State Validation (SATURDAY TASK) ---

/**
 * Placeholder for validating a player's move input.
 */
function validateMove(state, moveName) {
    if (!moveName || typeof moveName !== 'string' || moveName.length < 2) {
        console.warn("[GM] Validation failed: Move name is invalid or empty.");
        return false;
    }
    console.log(`[GM] VALIDATION SUCCESS: Move '${moveName}' is valid for the active Pokémon.`);
    return true;
}

// --- UTILITY: Mock Sender (SATURDAY TASK - INTEGRATION) ---

/**
 * Mocks the logic to send the player's move using the PA/NE layer.
 * @param {string} peerRole - 'host' or 'joiner'.
 * @param {string} moveName - The move to send.
 * @param {string} targetIP - The remote peer's IP address.
 * @param {number} targetPort - The remote peer's port.
 */
function sendMockMove(peerRole, moveName, targetIP, targetPort) {
    const state = currentState;
    if (!state) {
        throw new Error("Game state not initialized.");
    }
    
    // 1. Validate the input
    if (!validateMove(state, moveName)) {
        console.error("[GM] Move validation failed. Cannot send mock move.");
        return;
    }
    
    // 2. Mock the move announcement message (using PA's constants)
    const moveAnnouncement = {
        message_type: Protocol.MESSAGE_TYPES.ATTACK_ANNOUNCE, 
        game_id: state.gameId,
        move_name: moveName,
    };

    // 3. Update local state before sending
    state[peerRole].lastMove = moveName;
    console.log(`[GM] Updating state: ${peerRole} chose ${moveName}.`);

    // 4. Send the packet using the Network Engineer's utility
    NEService.sendPacket(moveAnnouncement, targetIP, targetPort);
}

// --- FINAL EXPORTS (CommonJS) ---

module.exports = {
    loadPokemonData,
    validateTeam,
    initializeState,
    getGameState: () => currentState, 
    validateMove,
    sendMockMove, 
};