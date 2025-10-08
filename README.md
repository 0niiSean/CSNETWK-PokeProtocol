# CSNETWK-PokeProtocol
An implementation of the P2P Pokémon Battle Protocol (PokeProtocol) over UDP for the CSNETWK Machine Problem

### How to Run This Test

You will need to open **two separate terminals** (or command prompts) inside this project folder.

**1. In your FIRST terminal, start the Host:**

    The Host needs to be running first so it can listen for messages.

    ```bash
    node host.js
    ```

    You should see this output, and then it will wait:

    ```bash
    Host is listening on channel 4000. Waiting for a friend...
    ```

2.  **In your SECOND terminal, run the joiner:**
    The Joiner will send a message to the Host and wait for a reply.

    ```bash
    node joiner.js
    ```

    If everything works, you will see a two-way conversation!