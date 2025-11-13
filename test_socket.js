// temporary test_socket.js in root (for manual check)
const { initSocket } = require('./lib/network/udp_socket');

// Try binding on a common port (e.g., 5000)
initSocket(5000); 

// Expected output: "[NE] UDP Socket bound successfully. Listening on: 0.0.0.0:5000"
// Now try sending a packet to localhost:5000 from another terminal using netcat/socat 
// to verify the on('message') listener works.