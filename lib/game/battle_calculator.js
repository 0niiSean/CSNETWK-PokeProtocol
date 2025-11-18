// lib/game/battle_calculator.js

const Logger = require('../utils/logger');

// --- CONSTANTS from RFC and Game Rules (Level 50 Battle) ---
const BASE_LEVEL = 50;
const STAB_MULTIPLIER = 1.5; // Same Type Attack Bonus
const BOOST_FACTOR = 1.5; // Multiplier for one use of Special Stat Boost (per RFC)

// --- HELPER FUNCTIONS ---

/**
 * Calculates the total type effectiveness multiplier using the defender's pre-calculated data.
 * @param {string} moveType - The type of the attacking move (e.g., 'fire').
 * @param {Object} defenderPokemon - The defender's full Pokémon object (from game_state).
 * @returns {number} The final type effectiveness multiplier.
 */
function getTypeEffectiveness(moveType, defenderPokemon) {
    // Access the pre-calculated chart from the JSON data
    // (e.g., { "against_bug": 1, "against_fire": 2, ... })
    const effectivenessChart = defenderPokemon.baseStats.type_effectiveness;

    // The JSON keys are in the format "against_type"
    const key = `against_${moveType.toLowerCase()}`;
    
    // Find the multiplier. Default to 1.0 (neutral) if not found.
    const multiplier = effectivenessChart[key];

    if (multiplier === undefined) {
        Logger.warn('GM-CALC', `Type effectiveness key '${key}' not found for ${defenderPokemon.name}. Defaulting to 1.0.`);
        return 1.0;
    }
    
    Logger.verbose('GM-CALC', `Type Check: ${moveType} vs ${defenderPokemon.name} -> ${multiplier}x`);
    
    return multiplier;
}


/**
 * Calculates the damage based on the standard Pokémon formula, adapted for the RFC.
 * Formula simplified for base implementation: 
 * Damage = (((2 * Level / 5 + 2) * Power * AttStat / DefStat) / 50 + 2) * Modifiers
 * @param {Object} attackerState - Attacker's team/boost state (contains activePokemon).
 * @param {Object} defenderState - Defender's team/boost state (contains activePokemon).
 * @param {Object} move - The move data (must contain power, type, category).
 * @returns {number} The calculated damage amount.
 */
function calculateDamage(attackerState, defenderState, move) {
    const attacker = attackerState.activePokemon;
    const defender = defenderState.activePokemon;

    // 1. Determine Stats & Apply Boosts (per RFC rules)
    let attackStat = attacker.baseStats.attack;
    let defenseStat = defender.baseStats.defense;
    
    // Check move category ('Physical' or 'Special')
    const isSpecial = move.category === 'Special';

    if (isSpecial) {
        attackStat = attacker.baseStats.sp_attack;
        defenseStat = defender.baseStats.sp_defense;
        
        // Apply Special Stat Boosts (limited use is tracked by GM state)
        if (attackerState.statBoosts.sp_attack_uses > 0) {
            attackStat *= BOOST_FACTOR; // Simulates the boost effect
        }
        if (defenderState.statBoosts.sp_defense_uses > 0) {
            defenseStat *= BOOST_FACTOR; // Simulates the boost effect
        }
    }
    
    // Safety check for division by zero (e.g., if defense is 0)
    if (defenseStat === 0) defenseStat = 1;

    // 2. Base Damage Calculation
    const baseDamage = Math.floor(
        (
            ((2 * BASE_LEVEL / 5 + 2) * move.power * attackStat / defenseStat) / 50
        ) 
        + 2
    );

    // 3. Modifiers (STAB, Type Effectiveness, Random)
    let modifiers = 1.0;
    
    // STAB (Same Type Attack Bonus)
    // 'attacker.baseStats.type' is an array like ['grass', 'poison']
    if (attacker.baseStats.type.includes(move.type.toLowerCase())) {
        modifiers *= STAB_MULTIPLIER;
    }

    // Type Effectiveness (CRITICAL FIX)
    // We now pass the full defender object to use its 'type_effectiveness' chart
    const typeEffectiveness = getTypeEffectiveness(move.type, defender);
    modifiers *= typeEffectiveness;

    // Simplified Random Roll (85% to 100%) - Use 0.925 fixed value for stability
    const randomRoll = 0.925; 
    modifiers *= randomRoll;
    
    // Final Damage
    const finalDamage = Math.max(1, Math.floor(baseDamage * modifiers));
    
    Logger.log('GM-CALC', 
        `Damage: ${finalDamage} (Type Effect: ${typeEffectiveness.toFixed(1)}x, Is Special: ${isSpecial})`
    );

    return finalDamage;
}

// --- CORE EXPORTS ---

module.exports = {
    calculateDamage,
};