/**
 * File: network/p2p-server.js
 * Purpose: Implements the Host Peer's logic for processing initial connection requests
 * (HANDSHAKE_REQUEST and SPECTATOR_REQUEST) and generating the synchronized battle seed.
 * * This module routes incoming messages from the UDP socket's application router (routerCallback).
 */

import { MESSAGE_TYPES, RELIABILITY_FIELDS } from '../protocol/constants.js';
import { createHandshakeResponse } from '../protocol/message-creators.js';
import * as Reliability from './reliability.js';
import * as Logger from '../utils/logger.js'; 
import * as GameState from '../game/battle-state.js'; // To update GameState with seed/remote info
import * as RNG from '../utils/rng.js'; // To initialize Host's RNG

/**
 * Generates a synchronized random seed (a simple large integer).
 * * CRITICAL: The Host Peer must generate this and send it in the HANDSHAKE_RESPONSE (RFC 4.2).
 * @returns {number} A random integer to be used as the battle seed.
 */
function generateBattleSeed() {
    // Math.random() returns a float, multiplying by 1 billion ensures a large integer.
    return Math.floor(Math.random() * 1000000000);
}

/**
 * Handles incoming HANDSHAKE_REQUEST messages from a Joiner Peer.
 * Host sends the HANDSHAKE_RESPONSE and updates the GameState with the Seed.
 * @param {Object} message - The decoded HANDSHAKE_REQUEST message (includes remoteIP/remotePort).
 */
function handleHandshakeRequest(message) {
    const { remoteIP, remotePort } = message;
    Logger.log('Server', `Received HANDSHAKE_REQUEST from ${remoteIP}:${remotePort}.`);
    
    // 1. Generate the synchronized seed (RFC 4.2 requirement)
    const seed = generateBattleSeed();
    
    // 2. Acknowledge the request and construct the response
    const receivedSeqNum = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER];
    const responseSeqNum = Reliability.getNextSequenceNumber();
    const responseMessage = createHandshakeResponse(responseSeqNum, seed, receivedSeqNum);

    // 3. Send the response reliably
    Reliability.sendReliable(responseMessage, remoteIP, remotePort);
    Logger.log('Server', `Sent HANDSHAKE_RESPONSE (Seq: ${responseSeqNum}, Seed: ${seed}).`);

    // 4. Update Host GameState with the remote connection details and seed
    // NOTE: This updates the seed on the Host's side as well, synchronizing the RNG seed (RFC 5.2).
    const localMonName = GameState.getBattleState().local.pokemonName;
    GameState.initializeState(localMonName, 5, 5, seed, remoteIP, remotePort); 
    RNG.initializeRNG(seed); // Initialize RNG for the Host Peer
}

/**
 * Handles incoming SPECTATOR_REQUEST messages.
 */
function handleSpectatorRequest(message) {
    const { remoteIP, remotePort } = message;
    Logger.log('Server', `Received SPECTATOR_REQUEST from ${remoteIP}:${remotePort}.`);
    
    const receivedSeqNum = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER];

    // CRITICAL: Acknowledge the request (Spectators are fire-and-forget control packets)
    Reliability.sendAck(receivedSeqNum, remoteIP, remotePort);
    Logger.log('Server', 'Spectator acknowledged. Connection pending application routing.');
}


/**
 * Main Server Router function.
 * Routes initial contact messages (Handshake, Spectator) to the correct internal handler.
 * @param {Object} message - The decoded application-level message (must contain remoteIP/remotePort).
 */
export function routeServerPacket(message) {
    switch (message.message_type) {
        case MESSAGE_TYPES.HANDSHAKE_REQUEST:
            handleHandshakeRequest(message);
            break;

        case MESSAGE_TYPES.SPECTATOR_REQUEST:
            handleSpectatorRequest(message);
            break;
            
        case MESSAGE_TYPES.BATTLE_SETUP:
            // BATTLE_SETUP messages are immediately routed to the Game State Machine 
            // via the main application router. The Host's logic for sending its 
            // own BATTLE_SETUP is executed upon receiving this message.
            Logger.log('Server', 'Received BATTLE_SETUP. Forwarding to Game State Router.');
            break;
            
        default:
            // All other message types are handled by the general application router.
            break; 
    }
}