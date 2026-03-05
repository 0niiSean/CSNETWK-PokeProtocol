# Developer Notes — PokeProtocol Project

## Version
**v0.1.0 (Draft)**

This document serves as the **developer workflow and contribution guide** for the PokeProtocol project. It outlines Git practices, branching conventions, and contribution steps for team members.

---

## Git Workflow
### 1. Initial Setup
```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
```

### 2. Check Available Branches
```bash
git branch -a
```
You should see the following:
```
main
dev
docs
feat-alpha
feat-bravo
feat-charlie
feat-delta
```

Always work on your **feature branch** or **dev branch** — never push directly to main.

---

### 3. Creating and Switching Branches
```bash
git checkout -b feat-alpha    # create and switch to new branch
git checkout feat-brava        # switch to existing branch
```

### 4. Pulling and Updating Branches
Before you start coding each session:
```bash
git add . 
git commit -m "message"
git push origin feat-<branch-name> #save local changes to your branch 
```
Then update your feature branch:
```bash
git checkout dev
git pull origin dev
git checkout feat-<branch-name>
git merge dev
git push origin feat-<branch-name> #your branch is updated with the latest dev branch
```
This ensures your branch has the latest updates.

---

### 5. Adding and Committing Changes
```bash
git add .
git commit -m "short descriptive message"
```
Commit messages should be short and action-based (e.g. `add handshake validation` or `update ACK sequence handler`).

---

### 6. Pushing Changes
```bash
git push origin feat-<branch-name>
```
After pushing, update the changelog if your changes affect functionality.

---

## Branches
Feature branches are for your individual changes, keep pushing  


| `feat-alpha`      | Network architecture & UDP communication  |
| `feat-bravo`      | Message handling & reliability layer      |
| `feat-charlie`    | Game logic & state machine                |
| `feat-delta`      | UI & visualization components             |

---

## Changelog Conventions
This project uses the **Keep a Changelog** format with **Semantic Versioning**.

Format example:
```markdown
## [0.1.1] - 2025-10-10
### Added
- Implemented message retransmission logic

### Fixed
- Incorrect ACK number on sequence validation

### Changed
- Updated UDP port binding logic
```

Versions use the format **MAJOR.MINOR.PATCH**:
```
0.1.0 - initial draft version
1.0.0 - first stable release
```

---

## Formatting & Development Notes
- Use lowercase filenames with hyphens (e.g., `battle-engine.js`)
- All protocol constants must follow uppercase snake case (e.g., `MESSAGE_TYPE_ATTACK`)
- Update the changelog **after every major push**
- Keep documentation commits separate from implementation commits

---

## Recommended Session Routine
1. `git checkout dev`
2. `git pull origin dev`
3. `git checkout your-feature-branch`
4. `git merge dev`
5. Work and commit
6. `git push origin your-feature-branch`
7. Update `CHANGELOG.md`

---

## Collaboration Guidelines
- Do **not** push directly to `main`.(this is for stable versions only)
- Merge into `dev` for testing before any stable release.
- Keep commits modular — avoid bundling unrelated changes.
- Always write clear commit messages and test before merging.

---

## Document Updates
For documentation-only changes:
```bash
git checkout docs
git pull origin docs
#make sure to pull the latest doc version before you do anything
git add docs/
git commit -m "update notes"
git push origin docs
```

---

## References
- *RFC PokeProtocol-1.pdf*                                              - Primary reference document for protocol implementation and structure.
- *Semantive  Versioning 2.0.0 [/semver.org/spec/v2.0.0.html]           -Reference for project structure
- *Keep a changelog 1.0.0      [https://keepachangelog.com/en/1.0.0/]   -Reference for formatting

---

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

**2.  In your SECOND terminal, run the joiner:**
    The Joiner will send a message to the Host and wait for a reply.

    ```bash
    node joiner.js
    ```

    If everything works, you will see a two-way conversation!


End of developer notes.

