/**
 * File: utils/logger.js
 * Purpose: Centralized logging utility to control output based on severity and a 'Verbose Mode'.
 * This helps satisfy the debugging and verbose mode requirements often found in network projects.
 */

let verboseMode = false;
let isInitialized = false;

// Log levels for internal use
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    LOG: 2,
    VERBOSE: 3,
};

/**
 * Initializes the logger and sets the verbose mode preference.
 * @param {boolean} [verbose=false] - Whether to show verbose/debug output (ACKs, retransmissions).
 */
export function initializeLogger(verbose = false) {
    if (isInitialized) return;
    verboseMode = verbose;
    isInitialized = true;
    if (verboseMode) {
        console.log(`[Logger] Verbose Mode ENABLED. Showing all network activity.`);
    }
}

/**
 * Generic logging function.
 * @param {string} source - The source module (e.g., 'SM', 'UDP', 'Reliability').
 * @param {string} message - The message content.
 * @param {number} level - The severity level (LOG_LEVELS).
 */
function output(source, message, level) {
    if (!isInitialized) {
        initializeLogger(false);
    }
    
    // Only log VERBOSE messages if the flag is set, otherwise log everything else.
    if (level === LOG_LEVELS.VERBOSE && !verboseMode) {
        return; 
    }
    
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const logPrefix = `[${timestamp}][${source}]`;

    switch (level) {
        case LOG_LEVELS.ERROR:
            console.error(`${logPrefix} ERROR: ${message}`);
            break;
        case LOG_LEVELS.WARN:
            console.warn(`${logPrefix} WARNING: ${message}`);
            break;
        default: // LOG and VERBOSE
            console.log(`${logPrefix} ${message}`);
            break;
    }
}

// --- Public Interface Functions ---

export function error(source, message) {
    output(source, message, LOG_LEVELS.ERROR);
}

export function warn(source, message) {
    output(source, message, LOG_LEVELS.WARN);
}

export function log(source, message) {
    output(source, message, LOG_LEVELS.LOG);
}

/** Logs verbose messages, typically for network reliability (ACKs, Retransmissions). */
export function verbose(source, message) {
    output(source, message, LOG_LEVELS.VERBOSE);
}