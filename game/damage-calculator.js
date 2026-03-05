/**
 * File: game/damage-calculator.js
 * Purpose: Implements the exact damage calculation formula required by RFC Section 6.
 * This is the deterministic function used by both peers to ensure synchronized battle results.
 */

// Placeholder for random number generation logic (from utils/rng.js)
// import { generateRandomModifier } from '../utils/rng.js'; 

/**
 * Calculates the damage inflicted by an attack based on the RFC formula.
 * The result is a floating-point number, which should be rounded by the caller (Turn Resolver).
 * Damage = (Base Power * Attacker Stat / Defender Stat) * Type1Effectiveness * Type2Effectiveness
 * * @param {Object} attackerMon - The attacking Pokémon's stats object (from BattleState).
 * @param {Object} defenderMon - The defending Pokémon's stats object (from BattleState).
 * @param {Object} move - The attacking move's details (must contain type, category, base_power).
 * @param {boolean} isBoosted - True if the attacker uses a Special Attack Boost (affects Attacker Stat).
 * @returns {number} The raw calculated damage (float).
 */
export function calculateDamage(attackerMon, defenderMon, move, isBoosted = false) {
    const { type, category, base_power } = move;

    // 1. Determine Attacker/Defender Stats based on Move Category (RFC 6)
    let attackerStat;
    let defenderStat;

    if (category === 'physical') {
        attackerStat = attackerMon.baseStats.attack;
        defenderStat = defenderMon.baseStats.defense;
    } else if (category === 'special') {
        attackerStat = attackerMon.baseStats.sp_attack;
        defenderStat = defenderMon.baseStats.sp_defense;

        // Apply stat boost if consumed (Placeholder: Assuming a 1.5x boost for simplicity, as specific multipliers aren't defined in RFC 6)
        if (isBoosted) {
             attackerStat *= 1.5;
        }
    } else {
        // Non-damaging move (e.g., Status move)
        return 0;
    }

    // 2. Calculate Type Effectiveness Multiplier (RFC 6)
    
    // Attacker Move Type vs Defender's Type 1
    const type1Effectiveness = defenderMon.baseStats.type_multipliers[type.toLowerCase()];
    
    // Attacker Move Type vs Defender's Type 2
    let type2Effectiveness = 1.0;
    if (defenderMon.baseStats.type2) {
        type2Effectiveness = defenderMon.baseStats.type_multipliers[type.toLowerCase()];
    }
    
    // Final Type Multiplier = Type1Eff * Type2Eff
    const totalTypeEffectiveness = type1Effectiveness * type2Effectiveness;

    // 3. Apply Damage Formula (RFC 6)

    if (defenderStat === 0) {
        // This returns an arbitrarily high number to represent a critical failure in defense (division by zero).
        return 9999; 
    }

    const baseDamage = (base_power * attackerStat) / defenderStat;
    
    let finalDamage = baseDamage * totalTypeEffectiveness;
    
    // NOTE: This section is commented out because the RFC requires a deterministic (non-random) calculation for synchronization.
    // Placeholder for Random Modifier (85% to 100% is typical, using 1.0 for strict RFC adherence in a deterministic system)
    // const randomModifier = generateRandomModifier(); 
    // finalDamage *= randomModifier; 
    
    // The result should be rounded by the caller (Turn Resolver/Engine)
    return finalDamage;
}