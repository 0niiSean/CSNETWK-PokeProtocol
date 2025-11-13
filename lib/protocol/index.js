// lib/protocol/index.js

import { MESSAGE_TYPES, HANDSHAKE_FIELDS, RELIABILITY_FIELDS } from './constants.js';
import { encode, decode } from './serializer.js';
import { 
    createHandshakeRequest, 
    createHandshakeResponse, 
    validateHandshakeRequest,
    createAckMessage,       // New Export
    parseHeader,            // New Export
} from './messages.js';


export const Protocol = {
    // Core Utilities 
    encode,
    decode,
    // Message Construction
    createHandshakeRequest,
    createHandshakeResponse,
    createAckMessage, 
    // Parsing/Validation
    validateHandshakeRequest,
    parseHeader,            // CRITICAL: NE uses this
    // Constants for all teams
    MESSAGE_TYPES,
    HANDSHAKE_FIELDS,
    RELIABILITY_FIELDS,
};

export default Protocol;