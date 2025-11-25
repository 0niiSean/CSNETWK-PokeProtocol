/**
 * File: utils/csv-data-loader.js
 * Purpose: Handles loading, parsing, and indexing Pokémon data from the CSV file.
 * This function provides the necessary base stats for the Damage Calculator and Battle State.
 * * Data Structure: Indexed by Pokémon Name for quick lookup.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import * as Logger from './logger.js';

// Global cache for loaded Pokémon data
let pokemonDataCache = null;

/**
 * Loads Pokémon data from the provided CSV file and indexes it by name.
 * @param {string} csvFilePath - Path to the pokemon (1).csv file.
 * @returns {Map<string, Object>} A Map of Pokémon Name to their standardized stats object.
 */
export function loadPokemonData(csvFilePath) {
    if (pokemonDataCache) {
        return pokemonDataCache;
    }
    
    try {
        const fileContent = fs.readFileSync(path.resolve(csvFilePath), { encoding: 'utf8' });
        
        // Parse the CSV content
        const records = parse(fileContent, {
            columns: true, // Use the first row as column names
            skip_empty_lines: true
        });

        const dataMap = new Map();

        // Index the data and convert necessary fields to numbers
        for (const record of records) {
            const name = record.name;
            if (!name) continue;

            const standardStats = {
                // RFC Section 6 requires:
                hp: parseInt(record.hp),
                attack: parseInt(record.attack),
                defense: parseInt(record.defense), // Physical Defense
                sp_attack: parseInt(record.sp_attack), // Special Attack
                sp_defense: parseInt(record.sp_defense), // Special Defense
                
                // For Type Effectiveness Multipliers:
                type1: record.type1.toLowerCase(),
                type2: record.type2 ? record.type2.toLowerCase() : null,

                // We need all 'against_' multipliers for the damage calculation function
                // Storing them as an object makes lookup easier: { bug: 1, dark: 1, ... }
                type_multipliers: {} 
            };

            // Dynamically extract all 'against_' multipliers for Type Effectiveness (RFC 6)
            for (const key in record) {
                if (key.startsWith('against_')) {
                    const typeName = key.substring(8);
                    standardStats.type_multipliers[typeName] = parseFloat(record[key]);
                }
            }
            
            dataMap.set(name, standardStats);
        }
        
        pokemonDataCache = dataMap;
        Logger.log('Utils', `Successfully loaded ${dataMap.size} Pokémon from CSV.`);
        return dataMap;

    } catch (e) {
        Logger.error('Utils', `Failed to load Pokémon data from CSV: ${e.message}`);
        // Return an empty map or throw to prevent silent errors later
        return new Map();
    }
}