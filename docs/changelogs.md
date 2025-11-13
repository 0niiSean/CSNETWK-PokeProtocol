# Changelogs

Notable changes to the project will be documented in this file.
This project follow [Smenatic Versioning] (https://semver.org/)

##[0.1.0] 2025-10-6
### Added 
    -New file structure
    -initial README.md and notes.md
    -globals.css

### Fixed
    -Flight search page divided into Flight-Search-Page.html divided into flight-search .html .css. js

### Changed
    -Linear gradient background in globals.css
    -:root in globals.css for custom colors
    -Sources.txt moved into docs/sources.md
    
##[0.1.1] 2025-10-7
    
### Changed
    -Global css changes
        -new background images and animations
        -bootstrap card container css modifications
        -removed old input and label for simplifications
    -flight-admin css and html files created

    -notes updated, instructions on how to use new background and animation objects

##[0.2.0] 2025-11-13
    
### Changed
    -Added
        - Core message serialization/deserialization utilities (lib/protocol/serializer.js).
        - Handshake message generation and structure definition (lib/protocol/messages.js).
        - Core UDP socket binding and listening logic (lib/network/udp_socket.js).
        - Pokémon static data file generated (lib/game/pokemon_data.json) from pokemon (1).csv.
        - Centralized logging module implemented (lib/utils/logger.js).

    -Modified
        - Implemented the shared lib/ directory structure for core modules (protocol, network, game, utils).
        - Implemented sendPacket utility to automatically inject sequence numbers and use Protocol.encode.
        - Refactored NE's message listener to use Protocol.parseHeader for quick processing.
        - Implemented conditional Verbose Mode using process.env.VERBOSE_MODE within the Logger.

    -Fixed
        - Resolved module resolution errors (ERR_MODULE_NOT_FOUND) by enforcing correct CommonJS/ESM module import patterns (.default or using file extensions where needed).

    -Testing
        - This initializes two mock sockets, host and joiner
        ``` bash
        node test_gm_integration.js
        ```

        - To verify that the Verbose Mode in the looger.js works:
        ``` bash
        set VERBOSE_MODE=true && node test_gm_integration.js
        ```

        - Verbose mode just logs litrerally everything so that we can check if the serialization is correct, if ACKs is triggered, and that there are no hidden characters or formats