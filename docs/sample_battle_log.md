This log shows a complete 1v1 battle, from start to finish.
It uses a Speed Check to assign the Attacker/Defender roles for Turn 1, and then reverses the roles each turn, as specified in RFC section 5.2.

Scenario:

Host App: Player chooses Pikachu (Speed: 90)

Joiner App: Player chooses Eevee (Speed: 55)

Outcome: Pikachu is faster and will be the Attacker for Turn 1.

--- [STEP 1: HANDSHAKE] ---
[Host's Terminal]
[NE] Socket listening on port 5000...

[Joiner's Terminal]
[PA] Connecting to Host at 127.0.0.1:5000...
[PA] Sending HANDSHAKE_REQUEST...

[Host's Terminal]
[NE] Received HANDSHAKE_REQUEST from Joiner.
[PA] Generating battle seed: 8675309
[PA] Sending HANDSHAKE_RESPONSE (Seed: 8675309)...
[NE] SENT Packet #1 [Type: HANDSHAKE_RESPONSE] to Joiner.

[Joiner's Terminal]
[NE] Received HANDSHAKE_RESPONSE. Seed: 8675309.
[PA] Handshake complete. STATE: CONNECTED.

--- [STEP 2: BATTLE SETUP (1v1 Pokémon Reveal)] ---
[Host's Terminal]
[UI] Please select your Pokémon from the list. (Player chooses Pikachu)
[GM] Sending BATTLE_SETUP with Pikachu...
[NE] SENT Packet #2 [Type: BATTLE_SETUP] to Joiner.

[Joiner's Terminal]
[UI] Please select your Pokémon from the list. (Player chooses Eevee)
[GM] Sending BATTLE_SETUP with Eevee...
[NE] SENT Packet #2 [Type: BATTLE_SETUP] to Host.

[Host's Terminal]
[NE] Received BATTLE_SETUP from Joiner.
[NE] ACK RECEIVED for Packet #2.
[GM] Opponent has chosen Eevee. Battle is starting!
[GM-ENGINE] STATE: WAITING_FOR_MOVE.

[Joiner's Terminal]
[NE] Received BATTLE_SETUP from Host.
[NE] ACK RECEIVED for Packet #2.
[GM] Opponent has chosen Pikachu. Battle is starting!
[GM-ENGINE] STATE: WAITING_FOR_MOVE.

--- [STEP 3: TURN 1 (Speed Check & Attack)] ---
[Host's Terminal (Pikachu)]
[GM-ENGINE] Turn 1.
[GM-ENGINE] Running speed check...
[GM-ENGINE] Pikachu (Speed: 90) vs. Eevee (Speed: 55).
[GM-ENGINE] You are faster. Your role: ATTACKER.
[UI] Your turn! Please select a move. (Player chooses "Thunderbolt")
[PA] Sending ATTACK_ANNOUNCE (move_name: Thunderbolt)...
[NE] SENT Packet #3 [Type: ATTACK_ANNOUNCE] to Eevee.
[PA] STATE: AWAITING_DEFENSE

[Joiner's Terminal (Eevee)]
[GM-ENGINE] Turn 1.
[GM-ENGINE] Running speed check...
[GM-ENGINE] Pikachu (Speed: 90) vs. Eevee (Speed: 55).
[GM-ENGINE] You are slower. Your role: DEFENDER.
[UI] Opponent is choosing their move...
[NE] Received ATTACK_ANNOUNCE (move: Thunderbolt).
[PA] Sending DEFENSE_ANNOUNCE...
[NE] SENT Packet #3 [Type: DEFENSE_ANNOUNCE] to Pikachu.
[PA] STATE: PROCESSING_TURN

--- [STEP 4: TURN 1 CALCULATION (Both peers)] ---
[Host's Terminal (Pikachu)]
[NE] Received DEFENSE_ANNOUNCE.
[PA] STATE: PROCESSING_TURN
[GM-CALC] Calculating... Attacker: Pikachu (SP_ATK: 50) vs. Defender: Eevee (SP_DEF: 65).
[GM-CALC] Move: Thunderbolt (Power: 90). STAB: No. Type-Effectiveness: 1x.
[GM-CALC] Damage: 25. Eevee HP: 30/55.
[PA] Sending CALCULATION_REPORT (attacker: Pikachu, damage: 25, defender_hp: 30)...
[NE] SENT Packet #4 [Type: CALCULATION_REPORT] to Eevee.

[Joiner's Terminal (Eevee)]
[GM-CALC] Calculating... Attacker: Pikachu (SP_ATK: 50) vs. Defender: Eevee (SP_DEF: 65).
[GM-CALC] Move: Thunderbolt (Power: 90). STAB: No. Type-Effectiveness: 1x.
[GM-CALC] Damage: 25. Eevee HP: 30/55.
[PA] Sending CALCULATION_REPORT (attacker: Pikachu, damage: 25, defender_hp: 30)...
[NE] SENT Packet #4 [Type: CALCULATION_REPORT] to Pikachu.

--- [STEP 5: TURN 1 CONFIRMATION (Checksum)] ---
[Host's Terminal (Pikachu)]
[NE] Received CALCULATION_REPORT.
[PA] Local (Hash: 25-30) matches Opponent's (Hash: 25-30). SYNC OK.
[PA] Sending CALCULATION_CONFIRM...
[NE] SENT Packet #5 [Type: CALCULATION_CONFIRM] to Eevee.

[Joiner's Terminal (Eevee)]
[NE] Received CALCULATION_REPORT.
[PA] Local (Hash: 25-30) matches Opponent's (Hash: 25-30). SYNC OK.
[PA] Sending CALCULATION_CONFIRM...
[NE] SENT Packet #5 [Type: CALCULATION_CONFIRM] to Pikachu.

--- [STEP 6: TURN 2 (Roles Reverse)] ---
[Host's Terminal (Pikachu)]
[NE] Received CALCULATION_CONFIRM. Turn 1 is complete.
[GM-ENGINE] Turn 2. Roles are reversing.
[GM-ENGINE] Your role: DEFENDER.
[UI] Opponent is choosing their move... (Pikachu HP: 35/35)

[Joiner's Terminal (Eevee)]
[NE] Received CALCULATION_CONFIRM. Turn 1 is complete.
[GM-ENGINE] Turn 2. Roles are reversing.
[GM-ENGINE] Your role: ATTACKER.
[UI] Your turn! Please select a move. (Player chooses "Tackle")
[PA] Sending ATTACK_ANNOUNCE (move_name: Tackle)...
[NE] SENT Packet #6 [Type: ATTACK_ANNOUNCE] to Pikachu.
[PA] STATE: AWAITING_DEFENSE

--- [STEP 7: TURN 2 (Execution & Calculation)] ---
[Host's Terminal (Pikachu)]
[NE] Received ATTACK_ANNOUNCE (move: Tackle).
[PA] Sending DEFENSE_ANNOUNCE...
[NE] SENT Packet #6 [Type: DEFENSE_ANNOUNCE] to Eevee.
[PA] STATE: PROCESSING_TURN
[GM-CALC] Calculating... Attacker: Eevee (ATK: 55) vs. Defender: Pikachu (DEF: 40).
[GM-CALC] Move: Tackle (Power: 40). STAB: No. Type-Effectiveness: 1x.
[GM-CALC] Damage: 30. Pikachu HP: 5/35.
[PA] Sending CALCULATION_REPORT (attacker: Eevee, damage: 30, defender_hp: 5)...
[NE] SENT Packet #7 [Type: CALCULATION_REPORT] to Eevee.

[Joiner's Terminal (Eevee)]
[NE] Received DEFENSE_ANNOUNCE.
[PA] STATE: PROCESSING_TURN
[GM-CALC] Calculating... Attacker: Eevee (ATK: 55) vs. Defender: Pikachu (DEF: 40).
[GM-CALC] Move: Tackle (Power: 40). STAB: No. Type-Effectiveness: 1x.
[GM-CALC] Damage: 30. Pikachu HP: 5/35.
[PA] Sending CALCULATION_REPORT (attacker: Eevee, damage: 30, defender_hp: 5)...
[NE] SENT Packet #7 [Type: CALCULATION_REPORT] to Pikachu.

--- [STEP 8: TURN 2 CONFIRMATION (Checksum)] ---
(Host and Joiner exchange CALCULATION_REPORT, hashes match.)
(Host and Joiner exchange CALCULATION_CONFIRM.)

--- [STEP 9: TURN 3 (Roles Reverse)] ---
[Host's Terminal (Pikachu)]
[NE] Received CALCULATION_CONFIRM. Turn 2 is complete.
[GM-ENGINE] Turn 3. Roles are reversing.
[GM-ENGINE] Your role: ATTACKER.
[UI] Your turn! Please select a move. (Player chooses "Thunderbolt")
[PA] Sending ATTACK_ANNOUNCE (move_name: Thunderbolt)...
[NE] SENT Packet #8 [Type: ATTACK_ANNOUNCE] to Eevee.

[Joiner's Terminal (Eevee)]
[NE] Received CALCULATION_CONFIRM. Turn 2 is complete.
[GM-ENGINE] Turn 3. Roles are reversing.
[GM-ENGINE] Your role: DEFENDER.
[UI] Opponent is choosing their move... (Eevee HP: 30/55)
[NE] Received ATTACK_ANNOUNCE (move: Thunderbolt).
[PA] Sending DEFENSE_ANNOUNCE...
[NE] SENT Packet #8 [Type: DEFENSE_ANNOUNCE] to Pikachu.

--- [STEP 10: TURN 3 CALCULATION & GAME OVER] ---
[Host's Terminal (Pikachu)]
[NE] Received DEFENSE_ANNOUNCE.
[PA] STATE: PROCESSING_TURN
[GM-CALC] Calculating... Attacker: Pikachu (SP_ATK: 50) vs. Defender: Eevee (SP_DEF: 65).
[GM-CALC] Damage: 25. Eevee HP: 5/55.
[PA] Sending CALCULATION_REPORT (attacker: Pikachu, damage: 25, defender_hp: 5)...
[NE] SENT Packet #9 [Type: CALCULATION_REPORT] to Eevee.

[Joiner's Terminal (Eevee)]
[GM-CALC] Calculating... Attacker: Pikachu (SP_ATK: 50) vs. Defender: Eevee (SP_DEF: 65).
[GM-CALC] Damage: 25. Eevee HP: 5/55.
[PA] Sending CALCULATION_REPORT (attacker: Pikachu, damage: 25, defender_hp: 5)...
[NE] SENT Packet #9 [Type: CALCULATION_REPORT] to Pikachu.

--- [STEP 11: TURN 3 CONFIRMATION] ---
(Host and Joiner exchange CALCULATION_REPORT and CALCULATION_CONFIRM. Turn 3 ends.)

--- [STEP 12: TURN 4 (Roles Reverse)] ---
[Joiner's Terminal (Eevee)]
[GM-ENGINE] Turn 4. Roles are reversing.
[GM-ENGINE] Your role: ATTACKER.
[UI] Your turn! Please select a move. (Player chooses "Tackle")
[PA] Sending ATTACK_ANNOUNCE (move_name: Tackle)...
[NE] SENT Packet #10 [Type: ATTACK_ANNOUNCE] to Pikachu.

[Host's Terminal (Pikachu)]
[NE] Received ATTACK_ANNOUNCE (move: Tackle).
[PA] Sending DEFENSE_ANNOUNCE...
[NE] SENT Packet #10 [Type: DEFENSE_ANNOUNCE] to Eevee.

--- [STEP 13: TURN 4 CALCULATION & GAME OVER] ---
[Joiner's Terminal (Eevee)]
[NE] Received DEFENSE_ANNOUNCE.
[PA] STATE: PROCESSING_TURN
[GM-CALC] Calculating... Attacker: Eevee (ATK: 55) vs. Defender: Pikachu (DEF: 40).
[GM-CALC] Damage: 30. Pikachu HP: -25/35.
[GM-ENGINE] Pikachu fainted!
[GM] Opponent's Pokémon fainted. You win!
[PA] Sending GAME_OVER (winner: Eevee, loser: Pikachu)...
[NE] SENT Packet #11 [Type: GAME_OVER] to Host.

[Host's Terminal (Pikachu)]
[GM-CALC] Calculating... Attacker: Eevee (ATK: 55) vs. Defender: Pikachu (DEF: 40).
[GM-CALC] Damage: 30. Pikachu HP: -25/35.
[GM-ENGINE] Pikachu fainted!
[NE] Received GAME_OVER from Joiner.
[PA] GAME_OVER message received.
[UI] You have lost the battle.
[NE] Socket closed.

[Joiner's Terminal (Eevee)]
[NE] ACK RECEIVED for Packet #11.
[NE] Socket closed.