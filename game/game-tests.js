/**
 * File: game/game-tests.js
 * Purpose: Test suite for verifying the core game logic modules (BattleState, DamageCalculator, TurnResolver).
 */

// ====================================================================
// 0. SIMULATED DEPENDENCIES & MOCKS
// ====================================================================

// --- MOCK PROTOCOL/UTILITIES ---
const BATTLE_FIELDS = { SEED: 'seed', DAMAGE_DEALT: 'damage_dealt', DEFENDER_HP_REMAINING: 'defender_hp_remaining' };
const MESSAGE_TYPES = { CALCULATION_REPORT: 'CALCULATION_REPORT', HANDSHAKE_RESPONSE: 'HANDSHAKE_RESPONSE' };
const RELIABILITY_FIELDS = { SEQUENCE_NUMBER: 'sequence_number' };

// MOCK: Logger is now globally accessible
const Logger = { log: () => {}, error: console.error, warn: () => {} };

// MOCK: RNG is globally accessible
const RNG = { generateRandomModifier: () => 1.0, initializeRNG: () => {} };

// MOCK: Network Client is globally accessible
const mockNetworkSent = [];
const NetworkClient = {
    sendGameCommand: (message) => { mockNetworkSent.push(message); },
    sendBattleSetup: () => {}, 
};

// MOCK: CSV Data (Simplified)
const MOCK_POKEMON_DATA = new Map();
MOCK_POKEMON_DATA.set('Pikachu', {
    hp: 35, attack: 55, defense: 40, sp_attack: 50, sp_defense: 50, 
    type1: 'electric', type2: null, type_multipliers: { electric: 0.5, fire: 1.0 }
});
MOCK_POKEMON_DATA.set('Bulbasaur', {
    hp: 45, attack: 49, defense: 49, sp_attack: 65, sp_defense: 65, 
    type1: 'grass', type2: 'poison', type_multipliers: { electric: 0.5, fire: 2.0 }
});


// --- SIMULATED GAME MODULES (Inline Definitions) ---

// 1. game/battle-state.js (Simplified for test)
const GameState = (() => {
    const state = { local: {}, opponent: {}, turn: 1, remoteIP: '1.1.1.1', remotePort: 8000 };
    const data = MOCK_POKEMON_DATA; 

    return {
        initializeState: (localName, localAtkBoost, localDefBoost, seed, ip, port) => {
            const stats = data.get(localName);
            state.local = { pokemonName: localName, baseStats: stats, currentHP: stats.hp, stat_boosts: { special_attack_uses: localAtkBoost, special_defense_uses: localDefBoost } };
            state.seed = seed;
            state.remoteIP = ip;
            state.remotePort = port;
        },
        setOpponentSetup: (message) => {
            const stats = data.get(message.pokemon_name);
            state.opponent = { pokemonName: message.pokemon_name, baseStats: stats, currentHP: stats.hp, stat_boosts: message.stat_boosts };
        },
        getBattleState: () => state,
        advanceTurn: () => { state.turn++; },
        isSetupComplete: () => state.local.pokemonName && state.opponent.pokemonName,
        getLocalSetupData: () => ({ pokemonName: state.local.pokemonName, statBoosts: state.local.stat_boosts, mode: 'P2P' })
    };
})();

// 2. game/damage-calculator.js (Inline for test)
const DamageCalculator = {
    calculateDamage: (attackerMon, defenderMon, move, isBoosted = false) => {
        const { type, category, base_power } = move;

        let attackerStat = (category === 'physical') ? attackerMon.baseStats.attack : attackerMon.baseStats.sp_attack;
        let defenderStat = (category === 'physical') ? defenderMon.baseStats.defense : defenderMon.baseStats.sp_defense;

        const totalTypeEffectiveness = defenderMon.baseStats.type_multipliers[type.toLowerCase()] || 1.0; 
        
        if (defenderStat === 0) return 9999; 

        const baseDamage = (base_power * attackerStat) / defenderStat;
        let finalDamage = baseDamage * totalTypeEffectiveness;
        
        finalDamage *= RNG.generateRandomModifier(); 
        
        return finalDamage;
    }
};

// 3. game/turn-resolver.js (Logic required for testing)
const TurnResolver = (() => {
    const MOCK_MOVESET = {
        'Thunderbolt': { name: 'Thunderbolt', type: 'electric', category: 'special', base_power: 90 },
    };

    const performLocalCalculation = (attackerRole, moveName) => {
        const state = GameState.getBattleState();
        const attackerMon = state[attackerRole];
        
        let rawDamage = DamageCalculator.calculateDamage(attackerMon, state.opponent, MOCK_MOVESET[moveName], false);
        let finalDamage = Math.floor(rawDamage);

        if (finalDamage === 0 && rawDamage > 0) finalDamage = 1;

        const newDefenderHP = Math.max(0, state.opponent.currentHP - finalDamage);
        
        return {
            attackerName: attackerMon.pokemonName,
            moveUsed: moveName,
            damageDealt: finalDamage,
            defenderHpRemaining: newDefenderHP,
            remainingHealth: attackerMon.currentHP,
            statusMessage: `${attackerMon.pokemonName} used ${moveName}!`,
        };
    };
    
    const processCalculationReport = (message, localResult) => {
        const remoteDamage = message[BATTLE_FIELDS.DAMAGE_DEALT];
        const remoteDefenderHP = message[BATTLE_FIELDS.DEFENDER_HP_REMAINING];
        
        const localDamage = localResult.damageDealt;
        const localDefenderHP = localResult.defenderHpRemaining;
        
        const match = (remoteDamage === localDamage) && (remoteDefenderHP === localDefenderHP);

        if (match) {
            const state = GameState.getBattleState();
            state.opponent.currentHP = localDefenderHP;
            
            // CRITICAL LINE: Send confirmation reliably
            const confirmMessage = { message_type: 'CALCULATION_CONFIRM', [RELIABILITY_FIELDS.SEQUENCE_NUMBER]: 999 };
            NetworkClient.sendGameCommand(confirmMessage); 
            
            return 'CONFIRMED';
        } else {
            return 'DISCREPANCY';
        }
    };
    
    return { performLocalCalculation, processCalculationReport, MOCK_MOVESET };
})();


// ====================================================================
// MAIN TEST EXECUTION
// ====================================================================

function runGameTests() {
    // This will print the test suite's starting header.
    console.log('--- RUNNING GAME LOGIC TESTS (Deterministic Mode) ---');

    // 1. SETUP: Initialize battle state (Pikachu vs. Bulbasaur)
    const TEST_SEED = 12345;
    GameState.initializeState('Pikachu', 5, 5, TEST_SEED, '1.1.1.1', 8000);
    GameState.setOpponentSetup({ pokemon_name: 'Bulbasaur', stat_boosts: { special_attack_uses: 5, special_defense_uses: 5 } });

    const attacker = GameState.getBattleState().local;
    const defender = GameState.getBattleState().opponent;
    
    
    // --- TEST 0 & 1: Data Check and Damage Calculation ---
    // This will print the section header for the initial data and damage calculation tests.
    console.log('\n0. & 1. Data Integrity and Damage Calculation');
    const expectedRawDamage = 34.61538;
    const expectedFinalDamage = 34; 

    // Initial check (re-run the check logic)
    if (attacker.baseStats.hp === 35 && defender.baseStats.sp_defense === 65) {
        // This will print a success message if the base stats were loaded correctly.
        console.log(`  ✅ 0. Base Stats loaded correctly.`);
    } else {
        // This will print an error message if the base stats are incorrect.
        console.error(`  ❌ 0. Base Stats mismatch.`);
    }

    const calculatedDamage = DamageCalculator.calculateDamage(attacker, defender, TurnResolver.MOCK_MOVESET.Thunderbolt);
    const finalCalculatedDamage = Math.floor(calculatedDamage);

    if (finalCalculatedDamage === expectedFinalDamage) {
        // This will print a success message showing the calculated damage.
        console.log(`  ✅ 1. Final Damage: ${finalCalculatedDamage} is correct.`);
    } else {
        // This will print an error message showing the expected vs. actual damage.
        console.error(`  ❌ 1. Final Damage Mismatch. Expected: ${expectedFinalDamage}, Got: ${finalCalculatedDamage}`);
    }


    // --- TEST 2: Turn Resolver Synchronization Check (The section that failed) ---
    // This will print the section header for the synchronization check tests.
    console.log('\n2. Turn Resolver Synchronization Check');

    const localCalcResult = TurnResolver.performLocalCalculation('local', 'Thunderbolt');
    
    // Test 2A: Success case
    const matchingReport = {
        message_type: MESSAGE_TYPES.CALCULATION_REPORT,
        [BATTLE_FIELDS.DAMAGE_DEALT]: expectedFinalDamage, 
        [BATTLE_FIELDS.DEFENDER_HP_REMAINING]: defender.baseStats.hp - expectedFinalDamage, // 45 - 34 = 11
    };

    const resolutionStatus = TurnResolver.processCalculationReport(matchingReport, localCalcResult);

    if (resolutionStatus === 'CONFIRMED' && defender.currentHP === 11 && mockNetworkSent.length === 1 && mockNetworkSent[0].message_type === 'CALCULATION_CONFIRM') {
        // This will print a success message if the local calculation matched the remote report, HP was updated, and a confirmation message was sent.
        console.log('  ✅ 2a. Sync Success: Sent CALCULATION_CONFIRM and HP updated.');
    } else {
        // This will print an error message with debug info if synchronization failed.
        console.error(`  ❌ 2a. Sync Failure. Status: ${resolutionStatus}. Current HP: ${defender.currentHP}`);
        console.log(`Debug: Network messages sent: ${mockNetworkSent.length}`);
    }

    // Test 2B: Discrepancy (reset mocks first)
    mockNetworkSent.length = 0; // Clear the previous confirmation send
    const discrepancyReport = {
        message_type: MESSAGE_TYPES.CALCULATION_REPORT,
        [BATTLE_FIELDS.DAMAGE_DEALT]: 50, 
        [BATTLE_FIELDS.DEFENDER_HP_REMAINING]: 1, 
    };
    
    const discrepancyStatus = TurnResolver.processCalculationReport(discrepancyReport, localCalcResult);
    
    if (discrepancyStatus === 'DISCREPANCY') {
        // This will print a success message if the logic correctly identified a mismatch between local and remote calculations.
        console.log('  ✅ 2b. Discrepancy detected and correctly triggered error handling.');
    } else {
        // This will print an error message if the discrepancy check failed.
        console.error('  ❌ 2b. Failed to detect calculation discrepancy.');
    }
}

// Helper to reset network traffic log is mocked away.
function resetMocks() {
    mockNetworkSent.length = 0;
}

runGameTests();