/**
 * File: game/battle-state.js
 * Purpose: Manages the centralized, synchronized state of the battle (The source of truth).
 * This includes HP, active Pokémon stats, opponent information, and the battle seed.
 */

import { loadPokemonData } from '../utils/csv-data-loader.js';
import * as Logger from '../utils/logger.js';
import * as RNG from '../utils/rng.js'; // Needed if we were calculating damage variance

// --- BATTLE STATE STRUCTURE ---
const battleState = {
    // Synchronization Data
    seed: null,
    turn: 1,
    remoteIP: null,
    remotePort: null,
    peerRole: null, // 'HOST' or 'JOINER'

    // Local Peer Data
    local: {
        pokemonName: null,
        baseStats: null,
        currentHP: 0,
        stat_boosts: {
            special_attack_uses: 0,
            special_defense_uses: 0,
        },
    },

    // Opponent Peer Data
    opponent: {
        pokemonName: null,
        baseStats: null, 
        currentHP: 0,
        stat_boosts: {
            special_attack_uses: 0,
            special_defense_uses: 0,
        },
    },
};

let pokemonData = null; // Cache for CSV loaded data

/**
 * Initializes the Battle State, loading data and setting synchronized values.
 * This is called once by the Host (with seed=0) and once by the Joiner (with the Host's seed).
 */
export function initializeState(localPokemonName, localAttackBoosts, localDefenseBoosts, seed, remoteIP, remotePort) {
    if (!pokemonData) {
        // Load data on first call
        pokemonData = loadPokemonData('./pokemon (1).csv'); 
        if (pokemonData.size === 0) {
             throw new Error("Critical Error: Pokémon CSV data failed to load or is empty.");
        }
    }

    const localMonStats = pokemonData.get(localPokemonName);
    if (!localMonStats) {
        throw new Error(`Critical Error: Pokémon '${localPokemonName}' not found in CSV data.`);
    }

    // --- Set Synced Base Data ---
    battleState.seed = seed;
    battleState.remoteIP = remoteIP;
    battleState.remotePort = remotePort;
    
    // NOTE: We only update local data on subsequent calls (like when the Joiner gets the seed)
    if (battleState.local.pokemonName !== localPokemonName) {
        battleState.local.pokemonName = localPokemonName;
        battleState.local.baseStats = localMonStats;
        battleState.local.currentHP = localMonStats.hp; 
        battleState.local.stat_boosts.special_attack_uses = localAttackBoosts;
        battleState.local.stat_boosts.special_defense_uses = localDefenseBoosts;
    }
    
    Logger.log('BattleState', `Initialized. Local HP: ${battleState.local.currentHP}, Seed: ${seed}`);
}

/**
 * Sets the opponent's initial setup data received via the BATTLE_SETUP message (RFC 4.4).
 */
export function setOpponentSetup(setupMessage) {
    const { pokemon_name, stat_boosts, communication_mode } = setupMessage;

    const opponentMonStats = pokemonData.get(pokemon_name);
    if (!opponentMonStats) {
        Logger.error('BattleState', `Opponent Pokémon '${pokemon_name}' not found in CSV.`);
        return; 
    }

    // --- Set Opponent Data ---
    battleState.opponent.pokemonName = pokemon_name;
    battleState.opponent.baseStats = opponentMonStats;
    battleState.opponent.currentHP = opponentMonStats.hp; 
    battleState.opponent.stat_boosts = stat_boosts;
    
    Logger.log('BattleState', `Opponent setup complete. HP: ${battleState.opponent.currentHP}`);
}

/**
 * **CRITICAL EXPORT:** Returns the data needed to send a BATTLE_SETUP packet.
 */
export function getLocalSetupData() {
    return {
        pokemonName: battleState.local.pokemonName,
        statBoosts: battleState.local.stat_boosts,
        mode: 'P2P' // Assuming P2P mode by default
    };
}

/**
 * Checks if the battle is fully initialized (both peers have exchanged setup).
 */
export function isSetupComplete() {
    return battleState.local.pokemonName !== null && battleState.opponent.pokemonName !== null;
}

/**
 * Returns the current global battle state object.
 */
export function getBattleState() {
    return battleState;
}

/**
 * Advances the turn counter.
 */
export function advanceTurn() {
    battleState.turn += 1;
}