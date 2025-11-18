// --- In lib/protocol/index.js ---

import { MESSAGE_TYPES, HANDSHAKE_FIELDS, RELIABILITY_FIELDS } from './constants.js';
import { encode, decode } from './serializer.js';
import { 
    createHandshakeRequest, 
    createHandshakeResponse, 
    validateHandshakeRequest,
    createAckMessage, 
    parseHeader, 
    // Add the new functions you created:
    createBattleSetupMessage, // <--- ADD THIS IMPORT
    // Add all other necessary message creators here (Attack, Report, etc.)
    createAttackAnnounceMessage,
    createDefenseAnnounceMessage,
    createCalculationReportMessage,
    createCalculationConfirmMessage,
    createResolutionRequestMessage,
    createGameOverMessage,
    createChatMessage,

} from './messages.js';


export const Protocol = {
    // Core Utilities 
    encode,
    decode,
    // Message Construction
    createHandshakeRequest,
    createHandshakeResponse,
    createAckMessage, 
    createBattleSetupMessage, // <--- ADD THIS EXPORT
    
    // Turn-Based Messages (for Game Master to use)
    createAttackAnnounceMessage,
    createDefenseAnnounceMessage,
    createCalculationReportMessage,
    createCalculationConfirmMessage,
    createResolutionRequestMessage,
    createGameOverMessage,
    createChatMessage,

    // Parsing/Validation
    validateHandshakeRequest,
    parseHeader, 
    
    // Constants for all teams
    MESSAGE_TYPES,
    HANDSHAKE_FIELDS,
    RELIABILITY_FIELDS,
};

export default Protocol;