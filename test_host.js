// test_host.js

const { initSocket, sendPacket } = require('./lib/network/udp_socket');

// FIX: Access the default export property
const Protocol = require('./lib/protocol').default; 

// 1. Initialize Host socket (listens on 5000)
initSocket(5000); 

// Define the critical initial message
// This line now works correctly!
const hostMessage = Protocol.createHandshakeRequest(
    'Host-Player-1', 
    12345, 
    ['Bulbasaur', 'Pikachu', 'Squirtle']
);

// 2. Wait 1 second for the socket to bind, then send to the Joiner (127.0.0.1:5001)
setTimeout(() => {
    console.log('--- Starting Handshake Request (Host to Joiner) ---');
    sendPacket(hostMessage, '127.0.0.1', 5001);
}, 1000);