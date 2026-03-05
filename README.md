# RFC PokeProtocol Repository

## Version

**v0.1.0 - Initial Draft**

---

## Members

* Airon Matthew
* LIM, JOSHUA EMMANUEL SESE
* Sean Andrei
* Roberta Netanya

---

## Features

* Peer-to-peer Pokémon battle simulation over UDP
* Four-step handshake for reliable turn synchronization
* Real-time state management and verification system
* Reliability layer using sequence numbers, ACKs, and retransmissions
* In-battle text and sticker messaging system
* Spectator mode for observing active matches
* Modular protocol states for scalability and testing

---

## Tech Stack

* **Protocol Base:** UDP (User Datagram Protocol)
* **Language:** Node.js (for planned implementation)
* **Frameworks:** Express.js (optional API interface)
* **Testing:** Manual peer-to-peer UDP simulation
* **Documentation Format:** RFC-based Markdown (RFC PokeProtocol-1)

---

## Project Structure

```
/public                 → static assets (HTML, CSS, JS)
/docs                   → documentation branch
    ├─ notes.md         → developer notes and workflow
    ├─ tasks.md         → contributor task list
    ├─ RFC PokeProtocol-1.pdf → reference protocol document
CHANGELOG.md             → changelog and version log
README.md                → main project documentation
```

---

## Milestones

* **Milestone 1:** Finalize protocol draft and documentation
* **Milestone 2:** Implement network reliability and communication layer
* **Milestone 3:** Develop and test peer synchronization logic
* **Milestone 4:** Integrate user interface and visualization tools

---

## Branch Structure

**Main**

> Stable release branch — only merge finalized and reviewed versions.

**Dev**

> Active development branch — merge feature branches here after testing.

**Docs**

> Documentation-only updates.

**Feature Branches (Aviation Themed)**

* `feat-blackbird` → Network Architecture & UDP Communication
* `feat-harrier` → Message Handling & Reliability Layer
* `feat-viper` → Game Logic & State Machine
* `feat-talon` → User Interface & Visualization Components

---

## Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/).

### [0.1.0] - 2025-10-09

#### Added

* RFC PokeProtocol draft specification
* Initial project structure and documentation
* Defined aviation-themed feature branches
* Established base milestones and goals

#### Planned

* Implement UDP socket handling prototype
* Add CLI battle simulation module
* Test reliability layer and peer synchronization

---

## References

* *RFC PokeProtocol-1.pdf* — Request for Comments: P2P Pokémon Battle Protocol (Draft)

---

## Maintainers

All contributors must follow the branching and changelog conventions described above.
