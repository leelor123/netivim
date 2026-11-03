# Prologue: level design notes

For the agent building the 3D levels. All text lives in `src/locales/he/ch00.json` (keys `ch00.*`), content metadata in `chapter.ts`, lines and failure texts in `dialogue.ts`, cutscene in `cutscenes.ts`. Labels: DOCUMENTED (has a source), RECONSTRUCTED (dramatized from known facts), FICTIONAL COMPOSITE (invented person). Noa, Dr. Samir Haddad and every NPC below are FICTIONAL COMPOSITES. The player never aims at or harms anyone. No timers punish the player; Story mode removes all clocks.

Checkpoint ids below are the FSM states (initial state is a checkpoint, final `complete`, plus `failed`). Lines per checkpoint are in `MISSION_LINES[missionId][checkpointId]`, hints in `HINT_KEYS`.

---
## Mission 1: The Archive at Night (EXP, 12 min, id `archive-at-night`)
Setting: a small regional heritage archive, today, after closing. Label: FICTIONAL COMPOSITE (the room), documents inside are DOCUMENTED.

Tutorial teaching order and where it happens:
| Order | Skill | Checkpoint | Prompt key |
|---|---|---|---|
| 1 | Move | arrival | ch00.tut.move |
| 2 | Look | reading_room | ch00.tut.look |
| 3 | Interact (lamp, drawer) | reading_room | ch00.tut.interact |
| 4 | Codex | codex_ledger | ch00.tut.codex |
| 5 | Archive (pick up, rotate, read label and provenance) | first_document | ch00.tut.archive |
| 6 | Pause and save | labels_table | ch00.tut.pause |
| 7 | Labels (documented / reconstructed / composite) | labels_table | ch00.tut.labels |

Beats and checkpoints (about one every 2-3 minutes):
1. `arrival` (0:00). Door creaks, Noa greets, one room, big controls prompt. Objective `ch00.obj.archive.1`.
2. `reading_room` (2:30). Samir: "no clock here". Look around; switch on the lamp, open a drawer (empty except a tin of cardamom: warm moment, Samir). Objective 2.
3. `codex_ledger` (5:00). A railway ledger on the desk glows blue: scanning it unlocks codex entry `jaffa-jerusalem-railway` (P-055). Warm moment: Noa's cold tea. Objective 3.
4. `first_document` (7:30). The locked cabinet holds the Basel Program re-creation (archive item `basel-program`, label DOCUMENTED, license "recreation"). Player rotates the 3D sheet, sees the provenance card. Objective 4.
5. `labels_table` (10:00). Three cards on the table: (a) "the Basel Program sentence" = DOCUMENTED, (b) "Noa and Samir" = FICTIONAL COMPOSITE, (c) "the Jaffa scene you are about to see" = RECONSTRUCTED. The player sorts them into three trays. First the pause menu is opened and a save made (compulsory step: the pause button glows until used). Objective 5.
6. `document_opens` (11:30). The sheet starts to glow; cutscene `ch00.opening` (75 s) plays and moves into mission 2. Objective 6.

Documented vs reconstructed here: the Basel Program sentence, the railway ledger fact, the dates in the codex are DOCUMENTED. The room, the lamp, the tea, the glowing paper are FICTIONAL.

Warm human moments: Samir's cardamom coffee versus Noa's tea (running joke, nobody wins); Noa talks to the archive door; the lamp flickers when it is given a name.

Failure conditions (soft, no life loss; the card appears with "What really happened" and a hint):
| Condition | Text id (dialogue.ts FAILURES) | Source |
|---|---|---|
| Basel card put in the wrong tray | label-basel | P-044 |
| Noa/Samir card put in the wrong tray | label-guides | none (composite) |
The wrong tray simply pops the card back; the card appears after the first mistake and never blocks progress.

Bot script outline (checkpoint -> inputs): arrival: walk forward 8 m, stop at door. reading_room: rotate camera 90 degrees, move to lamp, press interact, open drawer. codex_ledger: move to desk, interact on ledger, open codex menu, close. first_document: move to cabinet, interact, pick up sheet, rotate, close. labels_table: open pause menu, press save, resume, drag three cards to the right trays (and one deliberate wrong drop to exercise the failure card). document_opens: wait for cutscene end, assert mission complete.

---
## Mission 2: Letters from Jaffa, 1890s (LOG, 18 min, id `letters-from-jaffa`)
Setting: Jaffa and the road to Jerusalem, reconstructed. The player is a courier for a Jaffa merchants' office (FICTIONAL COMPOSITE, unnamed). Habib (office clerk), Debora (colony), Jamila (village), Eliyahu (Jerusalem household) are FICTIONAL COMPOSITES; the NPC label key is `ch00.label.composite-npc`. No named real person speaks in this mission.

Logistics rules: the player has a satchel of four deliveries and a cart with a visible capacity bar. Deliveries:
1. Well parts and a letter for the colony at Rishon LeZion (DOCUMENTED setting: P-047; the delivery itself is RECONSTRUCTED).
2. A letter and a parcel for a family in an Arab village near Jaffa (RECONSTRUCTED/COMPOSITE, no village is named; no claim about a real village).
3. A letter for an Old Yishuv family in Jerusalem, a halukka notice from relatives abroad (DOCUMENTED setting: P-054; letter RECONSTRUCTED).
4. Optional: a parcel for the Jaffa station master (tutorial for the railway ticket).

The communities, each in its own terms (design rules):
- Rishon LeZion colony (founded 1882, P-047): shown as farmers working a new well; the Rothschild support is a visible fact (25,000 francs for the well). Debora offers cold tea. Nothing about the previous users of the land is claimed; a codex tip points to Petah Tikva, where our sources are silent on the tenants.
- The Arab village: a living community with its own routine (morning bread, a wedding preparation, children playing, fields with a visible path). Not a backdrop: the player must walk the marked path between fields and accept the coffee to receive the village's reply letter. Jamila speaks first and is addressed by her name. The village is not shown as passive or as an obstacle.
- Old Yishuv household in Jerusalem (P-054): a family that lives on money and letters from abroad; the letter is what keeps the month's food coming. Eliyahu is dignified and not mocked. Shabbat candles are not shown (avoid unsourced custom detail).

Beats and checkpoints (8, about every 2.5 minutes):
1. `port_start` (0:00). Jaffa port. Habib hands the satchel. Player sees all four addresses. Objective 1.
2. `loaded` (2:30). Load the cart: heavy well parts first, letters on top. Teaches capacity and ordering. Objective 2.
3. `road_colony` (5:00). Drive the road to Rishon LeZion. Marked road, fields beside it.
4. `colony_delivered` (8:00). Hand over parts and letter. Debora's reply. Codex unlock: `rishon-lezion`, `edmond-de-rothschild`.
5. `village_arrival` (10:30). Walk the marked path to the village. Listen to the village for 20 s (optional, rewarded with the codex `ottoman-land-law` entry).
6. `village_delivered` (12:30). Deliver the letter, accept coffee, take the reply letter. Two Lenses card `land-and-tenants` unlocks here (land purchases and tenants; both narratives plus common ground plus limits, sources in `CH00_TWO_LENSES`).
7. `station` (14:30). Buy a ticket, walk to the platform, board before the bell finishes (bell is a soft cue; in Story mode the train waits). Codex unlock: `jaffa-jerusalem-railway` already unlocked in mission 1, so unlock `hovevei-zion` here instead.
8. `jerusalem_delivered` (17:00). Deliver the halukka letter in Jerusalem. Warm moment: the family offers a piece of bread and asks the courier to sit.
9. `complete` (18:00). Noa and Samir short debrief, Two Lenses reminder, quiz opens.


Documented vs reconstructed: DOCUMENTED = railway opened 26 Sep 1892, Navon franchise, Rishon founded 1882 and the well donation, halukka as a decisive source of support, Petah Tikva 3 Nov 1878, Land Law 1858 and Tapu Law about 1859. RECONSTRUCTED = the day, the route, the deliveries, the reply letters, every conversation. No source documents how a given village or colony felt on a given day; the game does not invent that. The 1897 Basel Congress and the 1899 letters appear only as archive items unlocked at the end (no scene claims local reactions).

Failure conditions (soft, instant retry from the last checkpoint):
| Condition | Trigger | Text id | Source |
|---|---|---|---|
| Missed train | not on the platform when the bell ends (Normal/Challenge only) | missed-train | P-055 |
| Wrong addressee | delivering an item to the wrong house; the NPC corrects politely, mission asks for retry | wrong-addressee | P-054 |
| Field crossing | cart or player leaves the marked path through a sown field; farmer waves, player is returned to the path | field-crossing | P-053 |
| Colony without parts | arriving at Rishon without the well parts | colony-no-parts | P-047 |
All four show `whatReallyHappenedKey` and `hintKey`. Adaptive assist (offered after repeated failures): slower bell, wider capacity bar, automatic path guide.

Hints: `HINT_KEYS['letters-from-jaffa'][checkpointId]`.

Bot script outline per checkpoint: port_start: read all four addresses (look at each parcel). loaded: pick well parts, then letters, confirm capacity. road_colony: follow the road marker, never leave the path. colony_delivered: interact with Debora, hand over parts. village_arrival: walk the path marker, stop 20 s. village_delivered: interact with Jamila, accept coffee (long press), collect reply. station: buy ticket, walk to the platform, board. jerusalem_delivered: interact with Eliyahu, hand over the letter. Negative tests: skip the parts (expect colony-no-parts), step off the path (expect field-crossing), wait on the platform too long in Normal (expect missed-train).

---
## Chapter flow
Briefing `BRIEFING_KEYS.chapter` -> Mission 1 -> cutscene `ch00.opening` -> Mission 2 -> Two Lenses -> Debrief `DEBRIEF_KEYS.chapter` -> quiz (8 questions, retries allowed) and Did You Know (6 facts). Hub lines in `HUB_LINES`. Unlock rewards: 14 codex entries, 3 archive items, 6 testimonies (2 documented, 4 composite).

## Facts the research did not approve (left out)
Ottoman census numbers (1850, 1877-78), Najib Nassar and al-Karmil, Zikhron Ya'akov, Druze, the American Colony, 30 Mulabbis tenants, who sold Petah Tikva, Achor Valley, soup kitchen, Hashomer reprisal raids, 1914 population (only as a range, not used).
