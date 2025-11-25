/**
 * File: game/chat-overlay.js
 * Purpose: Manages the sending and display of asynchronous chat messages and stickers.
 * * Complies with RFC 5.2, Step 4: Chat messages are independent of the turn-based logic.
 */

import * as NetworkClient from '../network/p2p-client.js';
import * as GameState from './battle-state.js';
import { getNextSequenceNumber } from '../network/reliability.js';
import { createChatMessage } from '../protocol/message-creators.js';
import { MESSAGE_TYPES, BATTLE_FIELDS } from '../protocol/constants.js';
import * as Logger from '../utils/logger.js';

// --- CHAT MESSAGE CONSTANTS (RFC 4.11) ---
const CONTENT_TYPE_TEXT = 'TEXT';
const CONTENT_TYPE_STICKER = 'STICKER';

/**
 * Sends a chat message or sticker packet reliably over the network.
 * @param {string} content - The message text or Base64 sticker data.
 * @param {string} contentType - 'TEXT' or 'STICKER'.
 * @returns {void}
 */
export function sendChat(content, contentType = CONTENT_TYPE_TEXT) {
    const state = GameState.getBattleState();
    
    // Ensure we have connectivity details
    if (!state.remoteIP || !state.remotePort) {
        Logger.error('Chat', 'Cannot send chat: Opponent IP/Port not set.');
        return;
    }
    
    // Get sender name (from local peer's Pokémon name or a generic identifier)
    const senderName = state.local.pokemonName || state.peerRole || 'Unknown Peer';

    // 1. Create the message
    const seqNum = getNextSequenceNumber();
    const message = createChatMessage(
        seqNum,
        senderName,
        contentType,
        contentType === CONTENT_TYPE_TEXT ? content : null,
        contentType === CONTENT_TYPE_STICKER ? content : null
    );

    // 2. Send reliably
    NetworkClient.sendGameCommand(message, state.remoteIP, state.remotePort);
    
    // 3. Display message locally immediately (no need to wait for echo)
    displayMessage(message, true);
}

/**
 * Displays an incoming or outgoing chat message/sticker on the console/UI.
 * * This function is typically called by the main Game State Router.
 * @param {Object} message - The decoded CHAT_MESSAGE object.
 * @param {boolean} [isLocal=false] - Whether the message originated locally.
 */
export function handleIncomingChat(message) {
    displayMessage(message);
}


function displayMessage(message, isLocal = false) {
    const sender = isLocal ? 'You' : message[BATTLE_FIELDS.SENDER_NAME];
    
    if (message.message_type !== MESSAGE_TYPES.CHAT_MESSAGE) return;

    if (message[BATTLE_FIELDS.CONTENT_TYPE] === CONTENT_TYPE_TEXT) {
        const text = message['message_text'];
        console.log(`\n[CHAT: ${sender}]: ${text}`);
    } else if (message[BATTLE_FIELDS.CONTENT_TYPE] === CONTENT_TYPE_STICKER) {
        // RFC 4.11 notes sticker_data is Base64 (abbreviated here)
        const data = message['sticker_data'].substring(0, 30) + '...'; 
        console.log(`\n[CHAT: ${sender}]: -- SENT STICKER -- (Data: ${data})`);
    } else {
        Logger.warn('Chat', `Received unsupported content type: ${message[BATTLE_FIELDS.CONTENT_TYPE]}`);
    }
}