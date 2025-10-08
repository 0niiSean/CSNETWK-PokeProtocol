const dgram = require('dgram');

// Turn it on
const joiner = dgram.createSocket('udp4');

// Know the Host's secret channel and address
const HOST_PORT = 4000;

const HOST_ADDRESS = '127.0.0.1';

// The message we want to send
const messageToSend = 'Hello Host, can you hear me?';

// Send the message to the host on their secret channel
joiner.send(messageToSend, HOST_PORT, HOST_ADDRESS, (err) => {
  if (err) {
    console.error('Failed to send message!', err);
    joiner.close();
  } else {
    console.log(`Message sent to Host! Waiting for a reply...`);
  }
});

// What to do when we hear the host reply back
joiner.on('message', (msg, rinfo) => {
  console.log(`Received a reply from the host: "${msg}"`);

  // Once we get the reply, our job is done.
  joiner.close();
});