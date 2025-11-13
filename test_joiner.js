// test_joiner.js

const { initSocket } = require('./lib/network/udp_socket');

// FIX: Access the default export property
// While not strictly needed in the Joiner, it's good practice to import Protocol correctly
const Protocol = require('./lib/protocol').default; 

// 1. Initialize Joiner socket (listens on 5001)
initSocket(5001); 
console.log('Joiner is waiting for a packet from the Host on 5000...');