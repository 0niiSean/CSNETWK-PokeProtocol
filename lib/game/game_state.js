// lib/game/game_state.js

const path = require('path');
const fs = require('fs');

const Protocol = require('../protocol').default; 
const Logger = require('../utils/logger');

// --- Global Battle Data Stores ---

let allPokemonData = {}; // Stores base stats and moveset for all known Pokémon (Keyed by name)
let allMoveData = {};    // Stores master list of move details (Keyed by move name)
let currentState = null; // The live Battle State object

// ====================================================================
// SECTION 1: DATA LOADING AND CORE UTILITIES
// ====================================================================

/**
 * Loads and processes all Pokémon data and compiles a master move list
 * from the 'pokemon_data.json' file.
 * NOTE: Assumes the JSON file contains an array of Pokémon objects.
 * * @returns {void}
 */
function loadPokemonData() {
    let data;
    try {
        const filePath = path.join(__dirname, 'pokemon_data.json');
        const rawData = fs.readFileSync(filePath, 'utf8');
        data = JSON.parse(rawData);
    } catch (error) {
        Logger.error("[GM] CRITICAL ERROR: Could not load pokemon_data.json. Using mock data.", error.message);
        // Simplified Mock Data (using the expected array structure)
        data = [
            { "name": "Bulbasaur", "pokedex_number": 1, "hp": 45, "attack": 49, "defense": 49, "sp_attack": 65, "sp_defense": 65, "speed": 45, "type1": "grass", "type2": "poison", "type_effectiveness": { "against_bug": 1, "against_fire": 2 }, "moveset": { "Tackle": { "power": 40, "type": "normal", "category": "Physical" } } },
            { "name": "Pikachu", "pokedex_number": 25, "hp": 35, "attack": 55, "defense": 40, "sp_attack": 50, "sp_defense": 50, "speed": 90, "type1": "electric", "type2": null, "type_effectiveness": { "against_ground": 2, "against_flying": 0.5 }, "moveset": { "Quick Attack": { "power": 40, "type": "normal", "category": "Physical" }, "Thunderbolt": { "power": 90, "type": "electric", "category": "Special" } } },
        ];
    }

    // 1. Map Pokémon data by name for easy lookup
    allPokemonData = data.reduce((acc, pokemon) => {
        // Combine type1 and type2 into a simple array
        pokemon.type = [pokemon.type1, pokemon.type2].filter(t => t != null);
        acc[pokemon.name] = pokemon;
        return acc;
    }, {});
    
    // 2. Derive the master move list from all Pokémon data
    allMoveData = {};
    data.forEach(pokemon => {
        Object.entries(pokemon.moveset).forEach(([moveName, moveDetails]) => {
            allMoveData[moveName] = moveDetails;
        });
    });

    Logger.log(`[GM] Loaded ${Object.keys(allPokemonData).length} Pokémon and ${Object.keys(allMoveData).length} unique moves.`);
}

/**
 * Retrieves the properties of a move from the global move list.
 * Used by the Battle Engine to find move power, type, and category.
 * * @param {string} moveName - The name of the move.
 * @returns {Object|undefined} The move object or undefined if not found.
 */
function getMove(moveName) {
    return allMoveData[moveName];
}

/**
 * Retrieves the current global Battle State object.
 * * @returns {Object|null} The current battle state.
 */
function getGameState() {
    return currentState;
}


// ====================================================================
// SECTION 2: INITIALIZATION AND SETUP
// ====================================================================

/**
 * Validates a list of Pokémon names and converts them into state objects
 * for battle use.
 * * @param {Array<string>} teamNames - Array of Pokémon names (must be length 1 for 1v1).
 * @returns {Array<Object>} Array of initialized Pokémon state objects.
 * @throws {Error} If data is not loaded or team size is incorrect.
 */
function validateTeam(teamNames) {
    if (!allPokemonData || Object.keys(allPokemonData).length === 0) {
        throw new Error("[GM] Data not loaded. Call loadPokemonData() first.");
    }
    // CRITICAL FIX: Enforce 1 Pokémon for the 1v1 MVB.
    if (!teamNames || teamNames.length !== 1) { 
        throw new Error("[GM] Team must contain exactly 1 Pokémon for a 1v1 battle.");
    }

    const team = [];
    const name = teamNames[0]; // Only one Pokémon expected
    const baseStats = allPokemonData[name];

    if (!baseStats) {
        throw new Error(`[GM] Invalid Pokémon selected: ${name}`);
    }
    
    // Defines the state object for the battle
    team.push({
        name: name,
        currentHp: baseStats.hp, 
        baseStats: baseStats,
        moveset: baseStats.moveset,
        type: baseStats.type,
        status: null, 
    });

    return team;
}

/**
 * Initializes the central BattleState object after the handshake provides both teams and the seed.
 * * @param {string} hostPeerId - The Peer ID of the Host.
 * @param {Array<string>} hostTeamNames - The Host's selected Pokémon names.
 * @param {string} joinerPeerId - The Peer ID of the Joiner.
 * @param {Array<string>} joinerTeamNames - The Joiner's selected Pokémon names.
 * @param {number} seed - The random seed generated by the Host.
 * @returns {Object} The complete initialized battle state.
 */
function initializeState(hostPeerId, hostTeamNames, joinerPeerId, joinerTeamNames, seed) {
    const hostTeam = validateTeam(hostTeamNames);
    const joinerTeam = validateTeam(joinerTeamNames);
    const initialBoosts = { sp_attack_uses: 5, sp_defense_uses: 5 }; // Example: 5 uses each

    currentState = {
        gameId: `GAME_${Date.now()}`,
        turn: 1, 
        statePhase: 'WAITING_FOR_MOVE', // Start of turn-based logic
        seed: seed,
        host: {
            peerId: hostPeerId,
            team: hostTeam,
            activePokemon: hostTeam[0],
            activePokemonName: hostTeam[0].name, 
            statBoosts: initialBoosts,
            lastMove: null,
        },
        joiner: {
            peerId: joinerPeerId,
            team: joinerTeam,
            activePokemon: joinerTeam[0],
            activePokemonName: joinerTeam[0].name,
            statBoosts: initialBoosts,
            lastMove: null,
        },
    };

    Logger.log('GM', `Battle State initialized. Host: ${hostTeam[0].name}, Joiner: ${joinerTeam[0].name}`);
    return currentState;
}

/**
 * Handles incoming BATTLE_SETUP messages and synchronizes the opponent's full
 * team and boost data locally.
 * * @param {Object} incomingMessage - The decoded BATTLE_SETUP message.
 * @param {string} localRole - The role of the local peer ('host' or 'joiner').
 * @returns {void}
 */
function handleBattleSetup(incomingMessage, localRole) {
    const state = currentState;
    if (!state) return Logger.error('GM', 'Cannot handle BATTLE_SETUP: State not initialized.');

    const opponentRole = (localRole === 'host' ? 'joiner' : 'host');
    
    // Re-hydrate the opponent's team data, adding runtime fields
    const opponentTeam = incomingMessage.team_data.map(p => ({
        ...p,
        currentHp: p.baseStats.hp, 
        status: null,
    }));

    // Update the live state with opponent's confirmed data
    state[opponentRole].team = opponentTeam;
    state[opponentRole].statBoosts = incomingMessage.stat_boosts;
    state[opponentRole].activePokemon = opponentTeam[0];
    state[opponentRole].activePokemonName = opponentTeam[0].name;

    Logger.log('GM', `Received BATTLE_SETUP. Opponent's team synchronized.`);
}


// ====================================================================
// SECTION 3: BATTLE MECHANICS & VALIDATION
// ====================================================================

/**
 * Sends the BATTLE_SETUP message containing the local peer's final team and
 * boost data via the Network Engine.
 * * @param {string} peerRole - The role of the local peer ('host' or 'joiner').
 * @param {string} remoteIP - The opponent's IP address.
 * @param {number} remotePort - The opponent's port.
 * @returns {void}
 */
function sendBattleSetup(peerRole, remoteIP, remotePort) {
    const state = currentState;
    if (!state) return Logger.error('GM', 'Cannot send BATTLE_SETUP: State not initialized.');

    // CRITICAL FIX: Break circular dependency by loading NE locally before use
    const { sendPacket } = require('../network/udp_socket');
    
    // We send only the necessary data for the opponent to build their state
    const peerState = state[peerRole];
    const teamData = peerState.team.map(p => ({
        name: p.name,
        baseStats: p.baseStats,
        moveset: p.moveset,
        type: p.type
    }));
    const boosts = peerState.statBoosts;

    // Use the PA message generator
    const setupMessage = Protocol.createBattleSetupMessage(state.gameId, teamData, boosts);
    
    sendPacket(setupMessage, remoteIP, remotePort);
    Logger.log('GM', `SENT BATTLE_SETUP for ${peerRole}.`);
}


/**
 * Decrements a stat boost counter for a given peer if one is available.
 * * @param {string} peerRole - 'host' or 'joiner'.
 * @param {string} boostType - 'sp_attack_uses' or 'sp_defense_uses'.
 * @returns {boolean} True if a boost was consumed, false otherwise.
 */
function consumeBoost(peerRole, boostType) {
    const peerState = currentState[peerRole];
    
    if (peerState && peerState.statBoosts[boostType] > 0) {
        peerState.statBoosts[boostType] -= 1;
        Logger.log('GM', `${peerRole} consumed 1 ${boostType}. Remaining: ${peerState.statBoosts[boostType]}`);
        return true;
    }
    
    Logger.warn('GM', `${peerRole} attempted to use ${boostType}, but none remain.`);
    return false;
}

/**
 * Validates a player's chosen move against the global move master list.
 * * @param {Object} state - The current game state (currentState).
 * @param {string} moveName - The name of the move chosen.
 * @returns {boolean} True if the move is valid and known, false otherwise.
 */
function validateMove(state, moveName) {
    const isValidGlobal = !!allMoveData[moveName];
    
    if (!isValidGlobal) {
        Logger.warn(`[GM] Validation failed: Move '${moveName}' is not in the move master list.`);
        return false;
    }
    
    // Optional: Check if the *active* Pokémon actually knows the move
    const role = state.turn % 2 !== 0 ? 'host' : 'joiner'; // Simplified turn owner logic
    const activePokemon = state[role].activePokemon;
    if (!activePokemon || !activePokemon.moveset[moveName]) {
        Logger.warn(`[GM] Validation failed: ${activePokemon.name} does not know ${moveName}.`);
        return false;
    }

    Logger.verbose(`[GM] VALIDATION SUCCESS: Move '${moveName}' is valid.`);
    return true;
}


// ====================================================================
// SECTION 4: GAME END CONDITIONS
// ====================================================================

/**
 * Checks if the specified active Pokémon has fainted (HP <= 0).
 * * @param {string} pokemonName - The name of the Pokémon to check.
 * @param {Object} state - The current game state.
 * @returns {boolean} True if the Pokémon has fainted.
 */
function checkIfFainted(pokemonName, state) {
    const hostPoke = state.host.activePokemon; 
    const joinerPoke = state.joiner.activePokemon;

    if (hostPoke.name === pokemonName) {
        return hostPoke.currentHp <= 0;
    } else if (joinerPoke.name === pokemonName) {
        return joinerPoke.currentHp <= 0;
    }
    return false;
}

/**
 * Checks if the battle is over (one of the active Pokémon has fainted).
 * * @param {Object} state - The current game state.
 * @returns {boolean} True if the game has ended.
 */
function checkGameOver(state) {
    return state.host.activePokemon.currentHp <= 0 || state.joiner.activePokemon.currentHp <= 0;
}


// ====================================================================
// FINAL EXPORTS (CommonJS)
// ====================================================================

module.exports = {
    // Data Loading / Access
    loadPokemonData,
    getMove,
    getGameState, 

    // Initialization / Setup
    validateTeam,
    initializeState,
    handleBattleSetup,
    sendBattleSetup,

    // Battle Mechanics
    consumeBoost,
    validateMove,

    // End Conditions
    checkIfFainted, 
    checkGameOver,
};