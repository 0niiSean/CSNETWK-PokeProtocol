/**
 * File: network/p2p-client.js
 * Purpose: Implements the logic for a Peer acting in a client role: 
 * sending initial HANDSHAKE_REQUEST (Joiner) or SPECTATOR_REQUEST, and sending general game commands.
 * This is the public API for the Game State Machine to send messages to the opponent.
 */

import * as Reliability from './reliability.js';
import { 
    createHandshakeRequest, 
    createSpectatorRequest, 
    createBattleSetupMessage 
} from '../protocol/message-creators.js';
import { RELIABILITY_FIELDS } from '../protocol/constants.js';
// Assuming the Logger utility is available in utils/
import * as Logger from '../utils/logger.js';

/**
 * Initiates the connection as a Joiner Peer by sending a HANDSHAKE_REQUEST. (RFC 4.1)
 * This should be the first reliable packet sent by the Joiner.
 * @param {string} remoteIP - The IP address of the Host Peer.
 * @param {number} remotePort - The port of the Host Peer.
 * @returns {void}
 */
export function initiateJoinerHandshake(remoteIP, remotePort) {
    if (!remoteIP || !remotePort) {
        throw new Error("Missing remote IP or port for handshake.");
    }
    
    // 1. Get next sequence number
    const seqNum = Reliability.getNextSequenceNumber();
    
    // 2. Create the minimal request message
    const handshakeRequest = createHandshakeRequest(seqNum);
    
    // 3. Use the reliable sender to guarantee the request reaches the host
    Reliability.sendReliable(handshakeRequest, remoteIP, remotePort);
    Logger.log('Client', `Sent HANDSHAKE_REQUEST (Seq: ${seqNum}) to Host.`);
}

/**
 * Initiates a connection as a Spectator Peer. (RFC 4.3)
 * @param {string} remoteIP - The IP address of the Host Peer.
 * @param {number} remotePort - The port of the Host Peer.
 * @returns {void}
 */
export function initiateSpectatorJoin(remoteIP, remotePort) {
    if (!remoteIP || !remotePort) {
        throw new Error("Missing remote IP or port for spectator join.");
    }
    
    const seqNum = Reliability.getNextSequenceNumber();
    const spectatorRequest = createSpectatorRequest(seqNum);
    
    // Spectator requests use the reliable layer
    Reliability.sendReliable(spectatorRequest, remoteIP, remotePort);
    Logger.log('Client', `Sent SPECTATOR_REQUEST (Seq: ${seqNum}) to Host.`);
}

/**
 * Sends a BATTLE_SETUP message containing the local Pokémon and stat boosts. (RFC 4.4)
 * This is used by both the Host and Joiner after the handshake completes.
 * @param {Object} setupData - The complete setup object ({ pokemonName, statBoosts, mode }).
 * @param {string} remoteIP - Opponent IP address.
 * @param {number} remotePort - Opponent port.
 * @returns {void}
 */
export function sendBattleSetup(setupData, remoteIP, remotePort) {
    const { pokemonName, statBoosts, mode } = setupData;
    
    const seqNum = Reliability.getNextSequenceNumber();
    const setupMessage = createBattleSetupMessage(seqNum, pokemonName, statBoosts, mode);

    // CRITICAL: The State Machine only calls this function AFTER receiving the opponent's packet, 
    // ensuring correct sequencing.
    Reliability.sendReliable(setupMessage, remoteIP, remotePort);
    Logger.log('Client', `Sent BATTLE_SETUP (Seq: ${seqNum}).`);
}

/**
 * Sends any general game command (like ATTACK_ANNOUNCE, CALCULATION_CONFIRM, etc.).
 * This acts as the main interface for the Game State Machine to transmit reliable turns.
 * @param {Object} message - The message object (must contain sequence number).
 * @param {string} remoteIP - Opponent IP address.
 * @param {number} remotePort - Opponent port.
 * @returns {void}
 */
export function sendGameCommand(message, remoteIP, remotePort) {
    const seqNum = message[RELIABILITY_FIELDS.SEQUENCE_NUMBER];

    if (!seqNum) {
        // Fallback or error handling for missing sequence number
        Logger.error('Client', `Attempted to send unreliable game command: ${message.message_type}. Injecting Sequence Number.`);
        message[RELIABILITY_FIELDS.SEQUENCE_NUMBER] = Reliability.getNextSequenceNumber();
    }
    
    // All game commands require confirmed delivery
    Reliability.sendReliable(message, remoteIP, remotePort);
    Logger.log('Client', `Sent game command: ${message.message_type} (Seq: ${message[RELIABILITY_FIELDS.SEQUENCE_NUMBER]})`);
}