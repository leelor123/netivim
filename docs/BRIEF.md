# MASTER BRIEF: 3D EDUCATIONAL GAME ON THE HISTORY OF ISRAEL'S WARS

You are the entire studio, inside Claude Code: Game Director, Principal Three.js/WebGL Engineer, Historian, UX and Accessibility Lead, and QA and Security Engineer. Design, build, test and ship a complete, polished 3D mobile narrative-educational game about the history of Israel's wars and pivotal defense events. It runs from the pre-state era to today's date.

It ships as a REAL INSTALLABLE ANDROID GAME APP (an APK that opens fullscreen from the home screen, with no browser and no Chrome UI). A web version comes later, in Phase 2 (see 1A).

Success: players finish knowing the history accurately and from more than one perspective. They had real fun and wanted to keep playing. They never hit a bug, a lag spike, a dead end or a lost save.

Begin now with Milestone M0 (section 11).

CONFIG: MAX_PARALLEL_AGENTS = 15. This is the most subagents running at the same time. I may tell you to raise or lower it; when I do, update CLAUDE.md and follow the new number from then on.

==================================================================
## 0. WHO I AM AND HOW TO WORK WITH ME
==================================================================
- I am a beginner and I don't read code. Talk to me in Hebrew, briefly, without jargon. Write code, file contents, comments and commit messages in English.
- My setup: Claude Code on a Windows PC. I play-test on a Samsung Galaxy S26 Ultra, as an installed app, usually with a Bluetooth game controller. My GitHub user is leelor123, and my existing site lives at leelor123.github.io/shifts.
- What I want on my phone:
  - a real game app, not a page in Chrome
  - with a controller connected: zero phone-style touch UI on screen
  - a graphics menu whose highest setting looks flawless
- I am on the Claude Max plan. Use parallel agents generously (section 3A), but still avoid waste: the limit is large, not infinite (section 3).
- AUTONOMY: you have full creative, technical and architectural freedom: title, art direction, characters, mechanics and scripts. Never ask me to confirm anything you can decide yourself. Make the call and record it in docs/DESIGN.md.
- NO LAZY FALLBACKS: never say "I cannot", "too complex" or "do it manually" before you have tried at least 3 workarounds and tested them.
- ESCAPE HATCH: some things only I can do, such as logging in, creating something in my GitHub account or approving a permission. For those, give me ONE short, copy-ready step in Hebrew, then keep working on everything else while you wait.

==================================================================
## 1. PRIORITY ORDER (when rules conflict)
==================================================================
1. Ethics and child safety
2. Historical accuracy and fairness
3. Stability: no bugs, no softlocks, no data loss
4. Performance: a smooth 60 fps on my phone (older phones come in Phase 2)
5. Fun
6. Scope and length

Never sacrifice 1-4 to gain 5-6. If scope must shrink, shrink content, never quality, and log the decision in PROGRESS.md.

==================================================================
## 1A. PHASE 1 FOCUS: WHAT IS DEFERRED TO PHASE 2
==================================================================
Phase 1 builds the core game: the full campaign, playable and polished in Hebrew, on my phone, with a controller.

The items below are DEFERRED. Do not build them, test them or spend agents on them until I write "start Phase 2". Wherever this brief mentions a deferred item, it applies only in Phase 2. Still design the architecture so each one plugs in later without a rewrite, and list them in PROGRESS.md under "Phase 2 backlog".

1. LANGUAGES: Phase 1 is Hebrew only (RTL). All visible text still lives in locale files from day one, with no hardcoded strings, so adding English, Arabic and Russian later is translation work only. Deferred: the other languages, their fonts and multi-language QA.
2. SECURITY HARDENING: Deferred: the strict CSP, claude-security scans, the Security agent, SHA-pinned actions and the npm-audit deploy gate. A cheap baseline stays in Phase 1, because it costs almost nothing now and is painful to retrofit (section 9).
3. WEB VERSION: Phase 1 ships the Android APK only, published on GitHub Releases. Deferred: the GitHub Pages PWA, the Service Worker, the download page, and testing on iOS Safari, Firefox and desktop browsers.
4. 2D LITE MODE: Deferred. In Phase 1, if WebGL2 is missing, show a clear Hebrew message instead.
5. OLD AND WEAK PHONES: Phase 1 targets my Galaxy S26 Ultra and similar recent phones. Deferred: the low-tier performance targets (6x CPU throttling at 30 fps, the 150 draw call cap). Still write efficient code from day one: pooling, no allocations in the loop, disposal, instancing, LOD. The Low/Medium presets still exist, and still look good.
6. TEACHER/CLASSROOM MODE: Deferred.
7. ACCESSIBILITY EXTRAS: Deferred: colorblind modes, the high-contrast UI, the dyslexia-friendly font, and the auto-play learning mode. These stay in Phase 1: subtitle size, reduced motion, controller button remapping, the difficulty levels and the Content Intensity setting.

KEPT IN PHASE 1 (not deferred): keyboard and mouse controls, voice narration with subtitles, the Testimonies mode, and the 3D Primary Source Archive.

BUILD ORDER (Phase 1):
- First ACT 1: the Prologue and Chapters 1-4, up to and including the Six-Day War. It must be completely finished, polished and released as an APK before any work on Chapter 5 or later.
- Then build Chapters 5-11 and the Epilogue, in parallel waves.

==================================================================
## 2. SESSION PROTOCOL (this project spans many sessions)
==================================================================
- In the first session, save this brief verbatim as docs/BRIEF.md. It is the source of truth.
- At the start of EVERY session, including when I only write "continue" or "המשך": read CLAUDE.md, PROGRESS.md and KNOWN_ISSUES.md, run the test suite, pick the next unchecked task and work. Don't re-plan what is already planned.
- Keep CLAUDE.md under 150 lines. It holds the stack, commands, architecture map, conventions, pinned versions and where things live.
- Work in small vertical increments. Commit after every green step using conventional commits, and push at the end of every milestone. The main branch must always build and pass its tests.
- Before context runs low or the session ends: update PROGRESS.md (done, in progress, the exact next step), commit and push. Nothing may live only in context.
- After each milestone, message me in Hebrew with at most 5 bullets: what's new, the link to play, and what to try on my phone. Then continue without waiting for me.

==================================================================
## 3. SKILLS, PLUGINS AND TOOLS: USE WHAT'S AVAILABLE
==================================================================
SETUP (M0):
- Install the three.js skill pack into the project, so every future session gets it:
  npx skills add cloudai-x/threejs-skills
  If that fails: git clone https://github.com/CloudAI-X/threejs-skills and copy skills/* into .claude/skills/. Commit .claude/skills.
- Pin three to 0.186.x exactly, because those skills target r186. Obey their "Common Mistakes" sections:
  - THREE.Timer, not Clock
  - renderer.setAnimationLoop, not requestAnimationFrame
  - PCFShadowMap, not PCFSoftShadowMap
  - imports from "three/addons/...", not "three/examples/jsm/..."
  - WebGL2 only

Use each of these whenever it is available in the session. If one is missing, carry on without it and never stop because of it.
- Planning:
  - superpowers:brainstorming in autonomous mode. Answer its questions yourself from this brief, log your assumptions in DESIGN.md, and don't ask me.
  - superpowers:writing-plans
  - engineering:architecture, with ADRs in docs/adr/
  - engineering:testing-strategy at M1
- 3D and UI:
  - threejs-fundamentals, threejs-interaction, threejs-performance, threejs-animation, threejs-geometry, threejs-materials, threejs-lighting, threejs-shaders, threejs-postprocessing, threejs-loaders, threejs-textures
  - frontend-design for UI art direction
  - slop-patterns:check-ui after every UI change
- Building:
  - superpowers:test-driven-development for game logic, saves, i18n, quiz and difficulty
  - superpowers:subagent-driven-development, dispatching-parallel-agents and using-git-worktrees for independent chapters
- History research:
  - deep-research, one chapter at a time, just before building that chapter. Output goes to research/chNN.md and SOURCES.md.
- Quality:
  - superpowers:systematic-debugging for every bug
  - superpowers:verification-before-completion before ANY "done"
  - a code review at every milestone, by a fresh subagent that did not write the code (superpowers:requesting-code-review or engineering:code-review)
  - design:accessibility-review (WCAG 2.1 AA) and design:ux-copy at every UI milestone
- Security (Phase 2 only, see 1A):
  - claude-security: "scan changes" at every milestone, and one full codebase scan before the final release
- Shipping:
  - engineering:deploy-checklist before every deploy

TOKEN EFFICIENCY (Max plan: large but finite usage):
- Model choice for the agent studio (section 3A):
  - cheaper models (Sonnet or Haiku) for bulk work: research summaries, dialogue, codex, quizzes, translations, repetitive checks
  - the strongest model for the lead, the architecture, the save system, performance and hard bugs
- Don't re-read large files: grep, then read only the ranges you need. Never paste long logs into context; summarize them.
- During work, run only the targeted tests. Run the full E2E and soak suites at milestones.

==================================================================
## 3A. THE AGENT STUDIO: MANY AGENTS IN PARALLEL
==================================================================
Run this project as a studio of specialized subagents working in parallel, so it ships fast and at top quality. You are the LEAD, the orchestrator. Use superpowers:dispatching-parallel-agents, superpowers:subagent-driven-development and superpowers:using-git-worktrees.

THE LEAD (you):
- Owns the architecture and docs/CONTRACTS.md: the interfaces between systems, the data schemas and the event names.
- Splits the work, writes each agent's brief, merges branches and runs the quality gates.
- Does not write bulk content.
- Only the lead may change a contract. An agent that needs a change asks the lead, and the lead updates every affected agent.

PHASE GATING (no parallel chaos):
1. M0-M1 are sequential. The lead builds the CORE alone first:
   - the game loop, the render/scene manager and the input abstraction
   - the save core and the data schemas
   - the i18n core and the mission state-machine framework
   - docs/CONTRACTS.md
2. When the core is stable, fan out the system agents in parallel (from M2).
3. When the vertical slice proves the engine, build the chapters in parallel WAVES (from M3).

THE ROSTER (each one is a separate subagent with its own git worktree and branch and its own files):

Systems:
1. Graphics and Settings agent: the presets, the flawless Ultra, adaptive quality, the settings menu.
2. Controls agent: controller-first mode, touch, remapping, glyphs, haptics.
3. Save System agent: the full section 8 behavior and its tests.
4. Audio agent: procedural music, SFX, ambience, narration hookup.
5. UI/Menus and Accessibility agent: the HUD, menus, focus navigation, fonts and the Hebrew locale files (colorblind modes come in Phase 2).
6. Localization agent (Phase 2 only): English, Arabic and Russian, RTL/LTR, overflow checks. In Phase 1 the UI agent owns the Hebrew locale files.
7. Cinematics agent: the cutscene timeline engine and its camera work.
8. World and Art agent: procedural terrain, the low-poly asset kit, era-specific looks, LODs.
9. Android/CI agent: Capacitor, the signed APK, the GitHub Actions workflows (GitHub Pages comes in Phase 2).
10. Performance agent: budgets, profiling, pooling, the soak test.

Per chapter (one pipeline for each chapter):
11. Historian agent: research, then research/chNN.md and the SOURCES.md entries.
12. Chapter Builder agent: the missions, levels, dialogue, cutscene scripts, codex and archive entries, quiz.
13. Fact-Checker agent (a FRESH agent, never the author): verifies every claim, label and figure against SOURCES.md.
14. QA Bot agent: the scripted playthrough, the solvability test, the balance and fairness check.

Independent reviewers (never review their own work):
15. Code Reviewer agent
16. Security agent (claude-security, Phase 2 only)
17. Accessibility Reviewer agent

RULES FOR AGENTS:
- Every agent gets a self-contained brief:
  - the goal
  - the files and folders it OWNS (it may not touch anything else)
  - the contracts it must follow
  - its Definition of Done
  - the exact tests it must pass
- Agents report back in at most 10 lines: what changed, test results, open issues. Never full logs.
- The lead merges a branch only when it is green and passes review, then re-runs the full suite on main. The lead resolves conflicts and keeps main always green.
- Never run more than MAX_PARALLEL_AGENTS at once. Queue the rest and start a new agent as soon as one finishes, so the pipeline is always full.
- Assign models as in section 3: the strongest for the lead, the architecture, save, performance and review; cheaper ones for content, research, translation and QA scripting.
- Near the usage limit:
  - stop launching new agents
  - let the running ones finish and commit
  - update PROGRESS.md with the queue and each agent's status, so the next session resumes the studio exactly where it stopped

==================================================================
## 4. GAME DESIGN
==================================================================
Write docs/DESIGN.md first, and keep it short. It covers:
- title, pitch and core loop
- a chapter and mission table with columns: chapter, mission, gameplay type, learning goals, minutes, source IDs
- difficulty and fun design
- the save system
- architecture and performance budgets
- at least 10 ORIGINAL features of your own that boost learning, fun or replayability

LENGTH: about 15 hours for a first playthrough, with no padding, grinding or repeated filler.
- Each chapter has 3-5 missions of 15-25 minutes, and each mission uses a different gameplay type: exploration, stealth/avoidance, convoy escort, holding a position (defensive, non-graphic), logistics, decision-making with consequences, puzzle, operation planning, civilian rescue, missile interception.
- Every chapter has a briefing, its missions, a cinematic cutscene, a debriefing, and a quiz with "Did You Know?" facts.
- Pacing alternates calm, tense and reflective moments.
- Sessions of 10-20 minutes. Save anywhere, and show a "previously on" recap when the player returns.
- Time budget per chapter:

  | Chapter                                                          | Time  |
  |------------------------------------------------------------------|-------|
  | Prologue/tutorial                                                | 0.5h  |
  | Ch1 Roots                                                        | 0.75h |
  | Ch2 1948                                                         | 2h    |
  | Ch3 1949-1956 and the Sinai Campaign                             | 1h    |
  | Ch4 Six-Day War                                                  | 1.5h  |
  | Ch5 War of Attrition and Yom Kippur War                          | 2h    |
  | Ch6 Entebbe, Litani, peace with Egypt, Osirak                    | 1h    |
  | Ch7 First Lebanon War                                            | 1h    |
  | Ch8 First Intifada, Gulf War, Oslo, peace with Jordan            | 1h    |
  | Ch9 Second Intifada, Defensive Shield, Second Lebanon War        | 1.25h |
  | Ch10 Gaza operations 2008-2021                                   | 1h    |
  | Ch11 October 7th, the war that followed, Iran, up to today       | 1.5h  |
  | Epilogue                                                         | 0.5h  |

  Optional side content adds more.

ETHICS-DRIVEN GAMEPLAY RULES:
- The player never aims at, shoots or kills people. Conflict is conveyed through objectives, maps, consequences, narration and cutscenes, and violence stays off-screen.
- There are no kill counts and no points for destruction.
- The missile-defense mechanic intercepts projectiles to protect civilians.
- Fun comes from discovery, agency, planning, rescue, mastery and story.
- Warm, light human moments are welcome where they are respectful.

DIFFICULTY: fair challenge. Players feel smart and capable and feel real tension, but are rarely frustrated.
- Challenge comes from decisions, planning, puzzles and awareness, not twitch reflexes or precision platforming.
- Three levels: Story, Normal (the default) and Challenge. The player can switch at any time, per mission.
- Soft failure:
  - a checkpoint every 2-3 minutes and instant retry
  - after a failure, show what really happened historically and offer a hint
- Adaptive assist: after repeated failures, OFFER (never force) hints, slower timers or more checkpoints, with no hidden penalties.
- No unfair timers, no instant-death surprises, no unclear objectives. Always telegraph danger.
- Juice:
  - responsive controls and satisfying audio-visual feedback
  - clear progress, unlockables, collectibles, achievements, and short rewarding loops
  - constant variety of gameplay types, mini-games and perspectives
- Quizzes are forgiving: retries allowed, rewards for correct answers, and they never block progress.

MANDATORY SYSTEMS:
1. Interactive historical timeline, plus a dynamic world map that changes across eras.
2. A searchable codex of people, units, places, operations and treaties.
3. A Primary Source Archive of collectible documents shown in 3D.
4. PHASE 2 ONLY: Teacher/Classroom Mode, with lesson plans per chapter and local progress tracking. Its data never leaves the device.
5. A quiz and "Did You Know?" after every chapter.
6. A Testimonies and Personal Stories mode.
7. A tactical decision and logistics engine for supply, evacuation and rescue.
8. A missile-defense interception mechanic.
9. A multi-perspective context viewer that clearly separates documented fact from dramatic reconstruction.
10. A dynamic procedural sound generator using Web Audio: engines, wind, sirens, distant combat, and an atmospheric score.
11. A Content Intensity setting (Gentle or Standard), plus content notes before sensitive chapters.

==================================================================
## 5. HISTORICAL ACCURACY, FAIRNESS AND SENSITIVITY
==================================================================
SOURCING:
- Research every chapter with web search, using reliable and diverse sources: archives, academic work, official sites, reputable international journalism, and sources from the different sides.
- Record the sources per chapter in SOURCES.md with IDs.
- Every codex entry, quiz answer, archive item and "Did You Know?" fact references a source ID.

LABELING:
- Tag every piece of content, in both the data and the UI, as one of:
  - DOCUMENTED
  - RECONSTRUCTED (dramatized)
  - FICTIONAL COMPOSITE
- Never invent quotes for real people.
- Testimonies are paraphrased with a citation. Use short quotes only, and only with a source. Label composite characters clearly as composites.

CONTESTED TOPICS:
- First the accepted facts, then each narrative in its own terms. Example: 1948 is the War of Independence in Israel and the Nakba for Palestinians.
- Casualty counts and other disputed figures always show their source and date. Where sources differ, show the range and who reports what.

RESPECT:
- Respect all victims on all sides.
- Never dehumanize any people. Distinguish organizations and armies from civilian populations.

OCTOBER 7TH AND THE WARS SINCE:
- Documentary tone. No depiction of atrocities, and only publicly documented stories.
- Center the chapter on civilians, rescue, first responders, the hostages and their families, and the human cost.
- Show a content note first, and offer the chapter as an illustrated summary.

COPYRIGHT:
- No copyrighted photos or text.
- Primary sources are either public-domain documents, bundled locally with their provenance, or faithful typeset or 3D re-creations with a citation.

MINIMUM COVERAGE (add any other significant events your research finds):
- The Aliyot, the Balfour Declaration, the 1936-39 Arab Revolt, the Holocaust as background, and the 1947 UN Partition Plan.
- 1948: the Declaration of Independence, Negba, the Burma Road.
- 1956 Sinai Campaign: the Mitla Pass.
- 1967 Six-Day War: Ammunition Hill, the Old City, the Golan.
- The War of Attrition.
- 1973 Yom Kippur War: the Valley of Tears, the Suez crossing, Operation Abirey-Halev.
- 1976 Entebbe; 1978 Litani; 1979 peace with Egypt; 1981 Osirak.
- 1982 First Lebanon War: Beaufort.
- The First Intifada, the 1991 Gulf War, Oslo, and peace with Jordan.
- The Second Intifada and Operation Defensive Shield (2002); the 2006 Second Lebanon War.
- Gaza operations: Cast Lead, Pillar of Defense, Protective Edge, Guardian of the Walls.
- The Abraham Accords.
- October 7th and the war that followed.
- The 2024 northern campaign against Hezbollah, and the April and October 2024 Iranian missile attacks.
- The June 2025 twelve-day war with Iran (Operation Rising Lion).
- The hostage deals and ceasefires.
- The 2026 confrontation with Iran and on the Lebanon and Gaza fronts.
- Everything significant after that, up to the current date.

Research recent events carefully before you write them. Show "History covered up to: <date>" in the game, and keep Ch11 fully data-driven so it can be updated later.

==================================================================
## 6. TECH STACK (decided: don't re-litigate)
==================================================================
TOOLING:
- Vite, TypeScript in strict mode, ES modules.
- three@0.186.x pinned exactly and bundled locally. No CDN and no external network calls.
- Vitest for unit tests and Playwright for E2E, with mobile emulation.
- ESLint and tsc with zero errors and zero warnings.

ARCHITECTURE:
- A fixed-timestep simulation, separate from rendering (renderer.setAnimationLoop plus THREE.Timer).
- Explicit state machines for the game flow and for every mission.
- Data-driven content: chapters, missions, dialogue, cutscenes, quizzes, codex and archive are typed data, schema-validated at build time.
- Reusable procedural level templates and terrain generators.
- A cutscene timeline engine.
- Each chapter is lazy-loaded behind its own loading screen.

ASSETS:
- 100% procedural: geometry, texture-free materials where possible, VFX, music and SFX (Web Audio).
- The only exception is open-licensed fonts, subset and bundled locally. Phase 1: a Hebrew font. The dyslexia-friendly, Arabic and Cyrillic fonts come in Phase 2.

LOOK: a stylized low-poly art style that reads well on small screens and runs on older phones. Use instancing, merging, LOD and culling.

RENDERING: WebGL2 only (three r163+ has no WebGL1). Restore a lost WebGL context automatically.
- Phase 1: if WebGL2 is unavailable, or a lost context can't be restored, show a clear Hebrew message.
- Phase 2: a 2D Canvas "Lite Mode" that still plays the story, maps, decisions, quizzes and codex.

DELIVERY 1, THE ANDROID APP (primary):
- Wrap the game with Capacitor (pinned version) as a native Android app. All assets live inside the APK, so it plays 100% offline.
- Immersive fullscreen: hide the status bar and the navigation bar, lock to landscape, keep the screen awake while playing.
- The Android Back button opens the pause menu. It never exits silently.
- A procedurally generated app icon and splash screen.
- GitHub Actions builds a SIGNED release APK on every milestone and attaches it to a GitHub Release.
- Signing keystore:
  - generate it once and store it only as a GitHub Actions encrypted secret
  - never commit it
  - if the gh CLI can't set the secret, give me ONE copy-ready step
  - tell me in Hebrew to keep a backup copy of it, because without it updates can't install over the old version
- Verify that the Gamepad API works inside the Android WebView with Xbox, DualSense and Switch Pro controllers. If buttons or axes are missing, add a small native KeyEvent/MotionEvent bridge.

DELIVERY 2, THE WEB VERSION (PHASE 2 ONLY, see 1A):
- A PWA on GitHub Pages, deployed via GitHub Actions (.github/workflows/deploy.yml) with the correct base path /<repo-name>/.
- A manifest, plus a Service Worker with versioned caches and a tight scope, for full offline play.
- An update must never break a save. Prompt the player to reload only at a safe moment.
- The Pages site also has a simple download page for the latest APK.

Both deliveries include README.md and LICENSE.

PERFORMANCE BUDGETS (enforce them in tests; change them only with measured evidence):
- Ultra preset on the Galaxy S26 Ultra: a locked 60 fps with zero visible hitches.
- PHASE 2 ONLY: Low and Medium presets on the low tier (6x CPU throttling, small viewport): a steady 30 fps, with p95 frame time of 33 ms or less.
- Per frame:
  - Low/Medium (Phase 2 target): no more than 150 draw calls and 300k triangles
  - High/Ultra: budgets you set and measure, written into CLAUDE.md
  - no allocations in the loop (use object pooling)
  - no long tasks over 50 ms
- Load:
  - the menu is interactive within 4 s on simulated 4G
  - initial JS is 600 KB gzipped or less
  - chapters load lazily
- Memory: a 30-minute soak test with flat geometry and texture counts. Dispose everything you replace.
- Adaptive quality (part of the graphics system in section 7):
  - automatic downgrade on sustained drops
  - thermal and battery awareness
  - a debug overlay showing frame time, draw calls, triangles and memory

==================================================================
## 7. CONTROLS, SETTINGS, ACCESSIBILITY, LANGUAGES
==================================================================
CONTROLLER-FIRST MODE (top priority):
- The game is fully playable end to end with a controller (Xbox, PlayStation/DualSense, Switch Pro) via the Gamepad API.
- The moment a controller connects, or any controller input arrives:
  - hide ALL touch UI instantly: virtual joystick, action buttons, touch hints
  - nothing on screen may look like a phone UI
- Every screen is navigable without touching the phone: menus, settings, map, timeline, codex, archive, quizzes, dialogs and the exit prompt.
  - a clear focus highlight
  - D-pad or left stick to move
  - A to confirm, B to go back
  - Start to pause
  - bumpers to switch tabs
  - triggers and sticks for scrolling and the camera
- Button prompts show the right glyphs for the connected controller family. Full remapping. Haptics through the controller's vibration, falling back to phone vibration.
- The first touch on the screen brings the touch UI back. Switching between controller and touch is seamless, in both directions, at any moment.
- If the controller disconnects mid-play: pause automatically, show the touch UI, and resume cleanly when it reconnects.

TOUCH AND DESKTOP:
- Touch: a virtual joystick and action buttons with adjustable size, opacity and layout, built on pointer events.
- Keyboard and mouse on desktop.

GRAPHICS SETTINGS:
- Presets: Battery Saver / Low / Medium / High / ULTRA, plus Auto and Custom.
- Auto runs a short benchmark on first launch and picks the best preset that holds the FPS target. On my S26 Ultra it should land on Ultra.
- Custom exposes each option on its own:
  - resolution scale (50-100%, or native) and FPS cap (30/60/unlocked)
  - shadow quality, anti-aliasing, ambient occlusion, bloom
  - fog and atmosphere, particles, vegetation density, render distance, LOD distance
  - color grading, depth of field in cutscenes
  - motion blur, OFF by default
- ULTRA must look flawless and premium, like a high-end stylized console game:
  - high-resolution soft shadows with tight shadow cameras
  - ambient occlusion
  - high-quality anti-aliasing (MSAA or SMAA): no shimmering edges
  - filmic tone mapping (AgX or ACES) with correct color management
  - tasteful bloom, color grading per era, atmospheric fog and light shafts
  - denser vegetation and particles, long render distance
  - cross-faded LODs so there is no visible popping
  - dithering against color banding
  - zero visual artifacts: no shadow acne, no peter-panning, no z-fighting, no flicker
- Ultra still holds a locked 60 fps on the S26 Ultra (see budgets).
- The game must look intentional and beautiful on every preset. Low is simpler, never broken.
- Changing graphics settings applies live, without a restart where possible, and the change is saved.

AUDIO: separate Master, Music, SFX and Narration sliders. Narration uses SpeechSynthesis when available, always with subtitles.

ACCESSIBILITY:
- Phase 1:
  - subtitle size and reduced motion
  - controller button remapping
  - the difficulty levels and the Content Intensity setting
- Phase 2 (see 1A):
  - a dyslexia-friendly font and a high-contrast UI
  - colorblind modes: protanopia, deuteranopia, tritanopia
  - an auto-play learning mode

LANGUAGES:
- Phase 1: Hebrew only, fully RTL, with every string in locale files.
- Phase 2: English, Arabic and Russian, with full RTL/LTR support, mirrored layouts and text-overflow handling (see 1A).

==================================================================
## 8. SAVE SYSTEM (exact behavior)
==================================================================
A. AUTO-SAVE ON EXIT: whenever the player leaves (closing the tab, switching apps, locking the phone, pressing Exit), save automatically.
   - Trigger on visibilitychange (the most reliable on mobile), pagehide and freeze.
   - Use a fast synchronous write so it finishes before the page is killed, and mirror it to IndexedDB.
   - In the Android app, also hook Capacitor's App pause/appStateChange events.
   - In the Android app, persist saves through Capacitor Preferences/Filesystem using the same atomic scheme, so clearing WebView data never loses progress.

B. EXCEPTION: if the player is mid-mission or mid-cutscene and has NOT pressed Save, do NOT overwrite the save with mid-mission state.
   - The last stable save stays untouched, for example the one from the start of that mission.
   - When the player returns, offer to continue from there.

C. MANUAL SAVE: a clear Save button in the pause menu and the HUD, available anywhere, including mid-mission and mid-cutscene.
   - A manual save stores the exact state.
   - After a manual save, the exit auto-save applies again.

D. ALSO AUTO-SAVE AT SAFE MOMENTS: finishing a mission or chapter, unlocking codex or archive items, changing settings, returning to the hub or menus.

E. EXIT PROMPT: pressing Exit during a mission without a recent manual save asks "Save and exit / Exit without saving / Cancel". Show a small "unsaved progress" indicator during missions.

F. CHECKPOINTS: in-mission checkpoints, used for retry after failure, live in memory only and never overwrite saves.

G. RELIABILITY:
   - Atomic, double-buffered writes with a checksum, so a kill mid-write never corrupts a save.
   - Schema-validated, versioned and size-limited saves, with migrations and safe recovery from corrupted data.
   - Multiple manual slots plus a dedicated autosave slot.
   - Achievements, and a data-reset option.

H. TESTS (unit and E2E): simulate pagehide and visibilitychange in each of these situations, then verify the correct resume in each:
   - in menus: must save
   - mid-mission: must not overwrite
   - mid-mission after a manual save: must save
   - mid-cutscene

==================================================================
## 9. ZERO-DEFECT QUALITY AND SECURITY (overrides any shortcut)
==================================================================
STABILITY:
- Unit tests cover game logic, saves, i18n, quiz and difficulty.
- Playwright E2E:
  - loads every chapter
  - runs a scripted bot through every mission
  - fails on any console error or warning
- Every mission has an automated solvability test proving it cannot softlock, and "restart from checkpoint" is always available.
- Controller E2E, with a mocked navigator.getGamepads:
  - connecting a controller hides every touch element
  - every menu and dialog can be completed with controller input only
  - disconnecting mid-play pauses the game and restores the touch UI
- Visual QA: Playwright screenshots of key scenes on every graphics preset. Review them for artifacts and keep them as visual-regression baselines.
- An Android smoke test: the APK installs and launches in an emulator in CI (or give me the exact command), opens fullscreen with no system bars, and survives pause/resume without losing state.

EDGE CASES TO HANDLE:
- tab backgrounding, orientation changes, calls and interruptions
- low memory and blocked or full storage
- controller disconnect
- WebGL context loss: restore it
- notches and safe areas, and multi-touch
- audio autoplay policy: resume the AudioContext on the first gesture
- app updates installed over an older version must never break saves

PLATFORMS:
- Phase 1: the Android app, which runs on Android's WebView (Chromium).
- Phase 2 (with the web version): Chrome, Samsung Internet, Safari for iOS and Firefox, service-worker updates, and offline/online transitions.

SECURITY AND PRIVACY, PHASE 1 BASELINE (cheap, keep it):
- Never put unsanitized data into innerHTML. Use textContent and the DOM APIs.
- Validate, version and size-limit all stored data.
- No trackers, analytics, third-party scripts or external calls. No personal data collection: the game is child- and privacy-friendly by design.
- Minimal dependencies, with pinned versions and a lockfile.
- No secrets in the repo, and NEVER the signing keystore. A leaked key cannot be undone.
- Deployment blocked if lint, typecheck, tests or build fail.

SECURITY HARDENING, PHASE 2 ONLY (see 1A):
- A strict Content Security Policy in a meta tag: no eval, no inline scripts, no third-party origins.
- A clean npm audit as a deploy gate.
- GitHub Actions with least-privilege permissions and actions pinned by commit SHA.
- claude-security scans.

HONESTY:
- Never claim "bug-free" without evidence.
- If you can't run something here, still write the tests, do a rigorous static review, and give me the exact one-line command to run them.

==================================================================
## 10. DEFINITION OF DONE (every milestone)
==================================================================
- Lint, typecheck, unit and E2E tests all green.
- Zero console errors or warnings.
- Performance budgets met.
- The accessibility review passed.
- Every mission checked for balance and fairness.
- KNOWN_ISSUES.md is empty: fix everything you find before moving on.
- A second review pass, by a fresh subagent, hunting for race conditions, memory leaks, edge cases and security issues.
- QA_REPORT.md updated with honest, evidence-backed results.
- PROGRESS.md updated, committed and pushed.
- A new signed APK released. Then the Hebrew update to me (section 2), with the APK link.

==================================================================
## 11. MILESTONES (continue automatically from one to the next)
==================================================================
M0 SETUP:
- Local project and git. If the gh CLI is installed and logged in, create the public repo leelor123/<repo-name> yourself. Otherwise give me ONE copy-ready step.
- Install the skill pack, pin the stack and write CLAUDE.md.
- Set up the Capacitor Android project and the signing secret.
- CI green: it builds a signed APK and attaches it to a GitHub Release.
- Send me the APK download link and a 3-step Hebrew install guide (allow installs from this source, install, open).

M1 DESIGN:
- docs/DESIGN.md, the ADRs, the test strategy, and a research plan per chapter.
- The lead alone builds the CORE and writes docs/CONTRACTS.md (section 3A), with tests.
- The Historian agents may already start researching the first chapters in parallel, because research touches no code.

M2 VERTICAL SLICE (the system agents work in parallel on top of the core):
- Main menu with every setting.
- Timeline and world map.
- Tutorial.
- A complete Chapter 1 or 2: 3D movement, the cutscene engine, procedural audio, the full controller-first mode plus touch, all graphics presets including a flawless Ultra, and the full save system with its tests.
- Ship it as a new APK and send me the link.

M3 ACT 1: the Prologue and Chapters 1-4, up to the Six-Day War.
- Build the remaining Act 1 chapters in parallel. Each chapter runs its own pipeline: Historian, then Builder, then Fact-Checker, then QA Bot, then review.
- Then a dedicated polish and balance pass on all of Act 1, until it is a finished, excellent ~5-hour game on its own.
- Release it as an APK and send me the update.

M4 ONWARD: Chapters 5-11 and the Epilogue, in PARALLEL WAVES, each chapter plug-in data on top of the shared engine.
- Each chapter runs the same pipeline.
- Several chapters run at once, up to MAX_PARALLEL_AGENTS.
- After each wave: merge, run the full suite, release a new APK, and send me the update.
- Continue without waiting for approval until the ~15-hour campaign is complete.

FINAL (end of Phase 1):
- A polish and balance pass.
- A 30-minute soak test.
- The final docs.
- Then tell me in Hebrew that Phase 1 is done, and list the Phase 2 backlog.

PHASE 2 (only after I write "start Phase 2"):
- Build the deferred items from section 1A, in the order I choose.
- Always included in Phase 2: QA in all 4 languages and a full claude-security scan.

DELIVERABLES:
- Full source.
- The docs: README.md, CLAUDE.md, docs/BRIEF.md, docs/DESIGN.md, docs/CONTRACTS.md, PROGRESS.md, SOURCES.md, QA_REPORT.md, KNOWN_ISSUES.md (empty), LICENSE.
- The CI/CD workflows.
- The signed APK on GitHub Releases.
- A 3-step guide in Hebrew to installing and updating the game on my phone.

Begin now with M0. You have full authority.
