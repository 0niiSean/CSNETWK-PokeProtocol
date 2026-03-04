/**
 * File: utils/rng.js
 * Purpose: Implements a synchronized, deterministic Pseudo-Random Number Generator (PRNG).
 * This ensures that when the Damage Calculator needs a random factor, both the Host and Joiner 
 * produce the EXACT same result, initialized by the 'seed' from the HANDSHAKE_RESPONSE.
 * * Complies with RFC 5.2, Step 1 (Host sends seed for RNG sync).
 */

let seed = 0;

/**
 * Implements a simple, fast, and deterministic PRNG (using the Mulberry32 algorithm).
 * @param {number} a - The seed value.
 * @returns {function(): number} A function that returns the next random floating-point number (0 <= x < 1).
 */
function mulberry32(a) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

let randomGenerator = mulberry32(seed);

/**
 * Initializes the RNG with the synchronized seed. Must be called once after handshake.
 * @param {number} newSeed - The seed value provided by the Host Peer.
 */
export function initializeRNG(newSeed) {
    if (typeof newSeed !== 'number') {
        throw new Error("RNG initialization requires a valid numeric seed.");
    }
    seed = newSeed;
    randomGenerator = mulberry32(seed);

    /* DEBUG
    const testValue = randomGenerator();
    console.log(`[RNG INIT] Seed: ${newSeed}, First test value: ${testValue.toFixed(10)}`);
    */
    randomGenerator = mulberry32(seed);
}

/**
 * Generates the next deterministic random floating-point number (0 <= x < 1).
 * @returns {number} The next random value.
 */
function nextRandom() {
    return randomGenerator();
}

/**
 * Generates the random damage modifier (e.g., 0.85 to 1.00 in standard Pokémon).
 * Since the RFC does not specify the range, we assume the typical 85% to 100% range.
 * @returns {number} The deterministic random modifier between 0.85 and 1.00.
 */
export function generateRandomModifier() {
    const min = 0.85;
    const max = 1.00;
    // (max - min) * random() + min

    /* DEBUG
    const randomValue = nextRandom();
    const modifier = (max - min) * randomValue + min;
    console.log(`[RNG CALL] nextRandom: ${randomValue.toFixed(10)}, modifier: ${modifier.toFixed(10)}`);
    */

    return (max - min) * nextRandom() + min;
}

// NOTE: You can add more complex RNG helpers here (e.g., checking for critical hit chance).