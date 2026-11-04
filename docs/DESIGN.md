# Netivim (נתיבים) — Game Design

Status: M1 baseline, 2026-11-03. Owner: lead. Decisions here are final unless a later entry in
"Decision log" replaces them. Written in autonomous mode (BRIEF §0/§3): assumptions are marked **[A]**.

## 1. Title, pitch, core loop

**Title:** נתיבים (Netivim, "Paths").
**Pitch:** A night-shift volunteer at a small heritage archive discovers that some documents
"open" — stepping into them lets you live the moment they record. Across 140 years you rebuild
roads, guide convoys, hide refugee ships, plan operations, rescue civilians and intercept
rockets — never aiming at a person — and leave each chapter understanding what happened, why,
and how different people remember it.

**Framing [A]:** The hub is *The Archive* (a fictional regional heritage archive, today). Two
FICTIONAL COMPOSITE guides accompany the player: **Noa** (a Jewish Israeli archivist, 30s) and
**Dr. Samir Haddad** (an Arab Israeli historian, 50s). They disagree respectfully and naturally
voice more than one perspective. Inside documents the player embodies a different composite
character per mission (labeled in UI). Real historical people appear only in DOCUMENTED roles
and never speak invented quotes.

**Core loop:**
```
Archive hub ──► Timeline: pick chapter ──► Briefing (map + context, 2 min)
     ▲                                          │
     │                                          ▼
 Unlocks: codex, archive items,        Missions (3-5, each a different gameplay type,
 testimonies, Living Map era            15-25 min, checkpoints every 2-3 min)
     ▲                                          │
     │                                          ▼
 Quiz + Did You Know ◄── Debrief (Choice Ledger) ◄── Cinematic cutscene
```
Micro-loop inside a mission: read the situation (map/HUD) → plan → act → immediate feedback →
checkpoint. Session target: one mission = one 15-20 min sitting; "Previously on" recap on return.

## 2. Act and chapter plan

Gameplay types (GT): EXP exploration, STL stealth/avoidance, CNV convoy escort, HLD holding a
position (non-graphic: supplies, morale, repairs, evacuation), LOG logistics, DEC decision with
consequences, PZL puzzle, PLN operation planning, RSC civilian rescue, INT missile interception.

Source IDs: each chapter's research file defines IDs (`P-`, `C1-`, `C2-`…). Missions cite them
once research lands; the content validator fails the build if a mission has none.

### Act 1 (built first, released as a complete ~5 h game)
| Ch | Mission | GT | Learning goals | Min |
|---|---|---|---|---|
| Prologue | The Archive at Night | EXP | Controls, codex, archive, labels (documented vs reconstructed) | 12 |
| Prologue | Letters from Jaffa, 1890s | LOG | Late-Ottoman society; Old Yishuv, Arab towns, First Aliyah colonies | 18 |
| Ch1 Roots | Tower and Stockade (1937) | PZL | Arab Revolt context, Peel plan, how a settlement rose in one day | 15 |
| Ch1 Roots | Night Landing (Aliyah Bet, 1946) | STL+RSC | White Paper, Holocaust survivors, British blockade | 18 |
| Ch1 Roots | The Vote (29 Nov 1947) | DEC | UNSCOP, Partition Plan map, reactions on all sides | 12 |
| Ch2 1948 | The Road to Jerusalem | CNV | Siege, Sha'ar HaGai convoys, civil-war phase | 25 |
| Ch2 1948 | Friday, Four O'Clock (12-14 May 1948) | LOG | Declaration of Independence: the 12 May vote, invitations on the morning of 14 May, the 16:00 ceremony | 18 |
| Ch2 1948 | Negba Holds | HLD | Invasion by Arab armies, southern front, kibbutz defense | 25 |
| Ch2 1948 | The Burma Road | PLN+LOG | Latrun, building the bypass road by night | 25 |
| Ch2 1948 | Two Memories | EXP (reflective) | Nakba and Independence; refugees; armistice lines | 20 |
| Ch3 1949-56 | Ma'abarot Winter | RSC | Mass immigration, transit camps, austerity | 20 |
| Ch3 1949-56 | Fedayeen Border Nights | STL | Border infiltrations and reprisals, civilians on both sides | 18 |
| Ch3 1949-56 | Mitla Pass | PLN | Sinai Campaign, Suez crisis, international pressure | 22 |
| Ch4 Six-Day | Waiting Period | DEC | May 1967 crisis, closure of Tiran, mobilization | 18 |
| Ch4 Six-Day | Operation Focus Map Room | PLN | Air strike planning as a map/timing puzzle (no targeting people) | 18 |
| Ch4 Six-Day | Ammunition Hill Medics | RSC | Jerusalem battle through evacuation of the wounded | 22 |
| Ch4 Six-Day | The Old City | EXP | Reunification/occupation narratives, Western Wall, residents | 18 |
| Ch4 Six-Day | Golan Ascent Logistics | LOG | Syrian front, Golan Heights, aftermath and UN 242 | 15 |

Act 1 total ≈ 5.3 h incl. briefings, cutscenes and quizzes (~10 min per chapter).

### Acts 2-3 (M4 waves; missions refined after each chapter's research)
| Ch | Missions (GT) | Target |
|---|---|---|
| Ch5 Attrition & Yom Kippur | Bar-Lev Line supply runs (LOG); Valley of Tears (HLD); Abirey-Halev crossing (PLN); bridge convoy (CNV); ceasefire talks at Km 101 (DEC) | 2 h |
| Ch6 Entebbe → Osirak | Entebbe (PLN+RSC); Litani civilians (DEC); Camp David / peace with Egypt (DEC); Osirak route (PLN) | 1 h |
| Ch7 First Lebanon War | Beaufort approach (PLN); Beirut evacuation corridors (RSC); Sabra-Shatila & Kahan Commission (EXP, reflective) | 1 h |
| Ch8 Intifada → Jordan | First Intifada street (EXP, perspectives); Gulf War sealed rooms (RSC); Oslo (DEC); Arava peace (LOG) | 1 h |
| Ch9 Second Intifada → 2006 | Bus-line safety (STL, awareness); Defensive Shield (PLN); northern shelters 2006 (RSC); Second Lebanon War (HLD) | 1.25 h |
| Ch10 Gaza 2008-2021 | Iron Dome first battery (INT); Protective Edge tunnels (PZL); Guardian of the Walls mixed cities (DEC); Abraham Accords (EXP) | 1 h |
| Ch11 Oct 7 → today | Content note + illustrated-summary option. Kibbutz first responders (RSC); MDA & ZAKA logistics (LOG); hostage families' square (EXP); Iran interceptions 2024-2026 (INT); ceasefires & deals (DEC). Data-driven; "History covered up to: <date>" | 1.5 h |
| Epilogue | Back in the Archive: the player curates their own exhibit from collected items (PZL/EXP) | 0.5 h |

## 3. Difficulty and fun
- **Levels:** Story / Normal (default) / Challenge, switchable any time, per mission. They tune
  timers, threat telegraph time, resource margins and hint frequency — never rules or content.
- **Soft failure:** checkpoints every 2-3 min, instant retry. The failure card shows
  "What really happened" (sourced) plus one hint.
- **Adaptive assist:** after 2 failures at the same checkpoint, OFFER (never force) one of:
  extra hint, +30% timers, an extra checkpoint. No hidden penalty; medals still attainable.
- **Fairness rules (enforced in QA):** every threat telegraphed ≥ 2 s (≥ 4 s on Story); no
  instant fail without warning; objective always shown; every mission solvable from every
  checkpoint (automated solvability test).
- **Fun sources:** discovery (archive items hidden in levels), agency (Choice Ledger), mastery
  (medals), planning (PLN maps), rescue (people helped — the only "count" in the game),
  story and warm human moments (bread, songs, kids' games, letters home).
- **Quizzes:** 5 questions per chapter, retries allowed, rewards for correct answers
  (archive item / postcard frame), never block progress.

## 4. Original features (≥ 10)
1. **Two Lenses** — on maps and key events, hold a button to switch between narratives
   (e.g. Independence / Nakba) over the same terrain; each lens is labeled and sourced.
2. **Living Map** — one 3D relief map of the region; scrubbing the timeline morphs borders,
   lines, settlements and population labels across eras.
3. **Archive Echoes** — documents found in missions appear in the 3D archive with a provenance
   card (who wrote it, when, why it is public domain or a re-creation).
4. **What Really Happened** — every failure shows the real historical outcome with sources.
5. **Field Notebook** — auto-written notebook of what the player learned; feeds the
   "Previously on" recap and the quiz pool.
6. **Choice Ledger** — decision missions log choices; the debrief compares them with the
   historical decision and its consequences for every side.
7. **Era Score** — procedural music whose instruments and modes change by decade.
8. **Testimony Lanterns** — optional glowing points in levels that play paraphrased, cited
   testimonies; collected into the Testimonies mode.
9. **Postcard Mode** — pause and compose a postcard with an era-accurate print style; saved to
   an album (purely local).
10. **Spot the Anachronism** — Challenge-level micro-puzzles: find the object that does not
    belong to the year (teaches material culture).
11. **Medals of Care** — mastery medals that reward non-violent excellence: "No one left
    behind", "Planner", "Curious mind", "Steady hands".
12. **Voices Choir** — end-of-chapter montage of the people met (composites labeled), each
    with one sourced line about what happened to people like them.

## 5. Ethics and content rules (summary; BRIEF §4-5 governs)
- No aiming at, shooting or killing people; no kill counts; violence off-screen.
- Labels on every content item: DOCUMENTED / RECONSTRUCTED / FICTIONAL COMPOSITE.
- Disputed figures always show source, date and range. No invented quotes for real people.
- Content Intensity: Gentle / Standard. Content notes before Ch2, Ch7, Ch9, Ch10, Ch11.
- Ch11: documentary tone, illustrated-summary option, only publicly documented stories.

## 6. Save system (BRIEF §8 is the spec; summary)
- Slots: `auto`, `manual-1..3`. Each slot = two buffers (A/B) + pointer; envelope
  `{version, seq, savedAt, checksum, payload}`; writes go to the inactive buffer, then the
  pointer flips. A torn write leaves the previous buffer valid.
- Stable vs volatile state: the game flow knows if the player is in a mission/cutscene.
  Exit triggers (visibilitychange, pagehide, freeze, Capacitor pause) write `auto` only when
  state is stable OR a manual save happened since the mission started.
- Backends: localStorage (sync, primary), IndexedDB mirror, Capacitor Preferences on Android
  (same envelope). Load picks the newest valid envelope (highest `seq`) across backends.
- Migrations keyed by version; corrupted envelopes fall back to the other buffer, then other
  backends; never throw to the player.

## 7. Architecture
- **Loop:** `renderer.setAnimationLoop` + `THREE.Timer`; fixed 60 Hz simulation step with
  accumulator (max 5 steps/frame) and render interpolation alpha.
- **Game flow FSM:** boot → title → hub → briefing → mission → cutscene → debrief → quiz → hub;
  pause is an overlay flag. Each mission is its own FSM built on a generic framework.
- **Event bus:** typed events (names in docs/CONTRACTS.md); systems never import each other's
  internals.
- **Content:** typed TS data modules per chapter (`src/content/chNN/`), validated by schema
  validators in unit tests and at build time; lazy-loaded with dynamic `import()`.
- **Input:** unified action layer (move, look, confirm, back, pause, tabs, scroll) fed by
  gamepad, touch and keyboard/mouse; "last active device" drives UI mode (touch UI hidden while
  a gamepad is active).
- **UI:** DOM overlay (RTL), focus-navigation graph for controller, all strings from locales.
- **Rendering:** preset table → renderer/post settings applied live; EffectComposer only on
  High/Ultra.
- **Platform:** `src/platform/` wraps Capacitor (back button, app state, Preferences, haptics).

## 8. Performance budgets
| Preset | Res. scale | Shadows | AA | Post | Draw calls | Triangles |
|---|---|---|---|---|---|---|
| Battery Saver | 0.6, 30 fps | off | none | none | ≤ 120 | ≤ 200k |
| Low | 0.75 | off | FXAA | none | ≤ 150 | ≤ 300k |
| Medium | 0.85 | 1024 PCF | FXAA | fog | ≤ 250 | ≤ 600k |
| High | 1.0 | 2048 PCF | SMAA | bloom, fog | ≤ 400 | ≤ 1.5M |
| Ultra | native ≤ 2x DPR | 4096 PCF, tight frustum | MSAA 4x + SMAA | SAO, bloom, grading, dither | ≤ 600 | ≤ 3M |

High/Ultra numbers are provisional until measured on the S26 Ultra in M2.
Global: initial JS ≤ 600 KB gzip; no long tasks > 50 ms; zero allocations per frame in the
loop; flat geometry/texture counts in a 30-min soak.

## 9. Assumptions log [A]
- A1 Archive framing with two composite guides gives a natural multi-perspective voice.
- A2 Prologue has 2 missions (tutorial exception to the 3-5 rule) to stay within 0.5 h.
- A3 Hebrew TTS quality varies by device; narration falls back to subtitles-only silently.
- A4 Content data is TypeScript (typed at compile time) plus runtime validators, no extra deps.
- A5 Mission lists for Ch3-Ch11 are adjusted after each chapter's research; changes logged here.

## 10. Decision log
- 2026-11-03 Initial design (this document).
- 2026-11-03 Ch2 mission "34 Hours" renamed and re-scoped: research (ch02) found no support for a 34-hour assembly claim; the mission now follows the documented 12-14 May timeline.
- 2026-11-04 M2 measurement (QA pass): the five built missions play in roughly half their target minutes (projected 5.5-11 min vs 12-18). Decision: no padding (BRIEF 1, 4). M3 deepens each mission with designed beats already in missions.md (e.g. Night Landing second rescue wave, more Jaffa and Tower stations) and per-mission briefings; lengths are re-measured with a human playtest on the S26 Ultra before Act 1 ships.
- 2026-11-03 UN documents (Res 181, 194, SC resolutions, armistice texts) are not freely redistributable; the archive shows a short cited excerpt plus a paraphrased summary, never the full text. Full texts only for items confirmed public domain.
- 2026-11-03 Research rule: Wikipedia may be used only as an index; claims need an opened primary, academic or reputable source. Unverified claims never reach quiz or facts.
