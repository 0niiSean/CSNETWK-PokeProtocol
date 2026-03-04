/**
 * File: game/chat-overlay.js
 * Purpose: Manages the sending and display of asynchronous chat messages and stickers.
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
 */
export function sendChat(content, contentType = CONTENT_TYPE_TEXT) {
    const state = GameState.getBattleState();
    
    // Ensure we have connectivity details
    if (!state.remoteIP || !state.remotePort) {
        // This will print an error if the opponent's network details are missing.
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
    
    // 3. Display message locally immediately
    displayMessage(message, true);
}

/**
 * Displays an incoming or outgoing chat message/sticker on the console/UI.
 */
export function handleIncomingChat(message) {
    displayMessage(message);
}


function displayMessage(message, isLocal = false) {
    const sender = isLocal ? 'You' : message[BATTLE_FIELDS.SENDER_NAME];
    
    if (message.message_type !== MESSAGE_TYPES.CHAT_MESSAGE) return;

    if (message[BATTLE_FIELDS.CONTENT_TYPE] === CONTENT_TYPE_TEXT) {
        const text = message['message_text'];
        // This will print the sender and the text message to the console.
        console.log(`\n[CHAT: ${sender}]: ${text}`);
    } else if (message[BATTLE_FIELDS.CONTENT_TYPE] === CONTENT_TYPE_STICKER) {
        // RFC 4.11 notes sticker_data is Base64 (abbreviated here)
        const data = message['sticker_data'].substring(0, 30) + '...'; 
        // This will print the sender and a truncated description of the sticker data to the console.
        console.log(`\n[CHAT: ${sender}]: -- SENT STICKER -- (Data: ${data})`);
    } else {
        // This will print a warning if a received chat message has an unrecognized content type.
        Logger.warn('Chat', `Received unsupported content type: ${message[BATTLE_FIELDS.CONTENT_TYPE]}`);
    }
}