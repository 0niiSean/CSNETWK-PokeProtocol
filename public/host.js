// host.js

// 1. Get our walkie-talkie (the dgram module)
const dgram = require('dgram');

// 2. Turn on our walkie-talkie so it can send and receive messages
const host = dgram.createSocket('udp4');

// 3. Decide on a secret channel to listen to. Let's use 4000.
const HOST_PORT = 4000;

// This part is for when the walkie-talkie is ready.
host.on('listening', () => {
  const address = host.address();
  console.log(`Host is listening on channel ${address.port}. Waiting for a friend...`);
});

// This is the most important part! What to do when we hear a message.
host.on('message', (msg, rinfo) => {
  // msg is the message we heard. rinfo tells us WHO sent it.
  console.log(`Received a message: "${msg}" from ${rinfo.address}:${rinfo.port}`);

  // Now, let's reply back to our friend!
  const replyMessage = 'Hello Joiner, I hear you!';

  host.send(replyMessage, rinfo.port, rinfo.address, (err) => {
    if (err) {
      console.error('Failed to send reply!', err);
      host.close();
    } else {
      console.log('Sent a reply back to our friend.');
    }
  });
});

// 4. Tell our walkie-talkie to start listening on our secret channel.
host.bind(HOST_PORT);