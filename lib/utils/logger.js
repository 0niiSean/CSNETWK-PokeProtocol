// lib/utils/logger.js

/**
 * Global logging utility for the project.
 * Allows easy toggling of Verbose mode via environment variable.
 */

// Check for verbose mode environment variable
const IS_VERBOSE_MODE = process.env.VERBOSE_MODE === 'true';

const Logger = {
    // Standard logging with category prefix
    log: (category, message) => {
        console.log(`[${category}] ${message}`);
    },

    // Warning and Error messages (always visible)
    warn: (category, message) => {
        console.warn(`[${category} WARNING] ${message}`);
    },

    error: (category, message, error) => {
        console.error(`[${category} ERROR] ${message}`, error);
    },

    // Verbose messages (only visible when VERBOSE_MODE is true)
    verbose: (category, message) => {
        if (IS_VERBOSE_MODE) {
            console.log(`[${category} VERBOSE] ${message}`);
        }
    },
    
    // Export the status for other modules to check (e.g., Verbose Mode)
    IS_VERBOSE_MODE: IS_VERBOSE_MODE,
};

module.exports = Logger;