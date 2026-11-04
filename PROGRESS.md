# Progress

## Milestone status
- [x] M0 Setup: project, pinned stack, skills, Capacitor Android, signing secret, CI release (v0.0.1)
- [x] M1 Design + core (v0.1.0)
- [x] M2 Vertical slice (v0.2.1)
- [ ] M3 Act 1 (Prologue + Ch1-4)
- [ ] M4 Waves (Ch5-11 + Epilogue)
- [ ] Final polish (end of Phase 1)

## Done (M1)
- docs/DESIGN.md (title, framing, loop, Act 1 mission table, Acts 2-3 plan, difficulty, 12 original
  features, save design, architecture, budgets, assumptions, decision log).
- ADRs 0001-0008 in docs/adr/. docs/TEST_STRATEGY.md. docs/CONTRACTS.md (events, flow, save, input,
  content, missions, scenes, agent ownership map).
- Core (src/core): EventBus, FSM + analyzeMachine, GameLoop (fixed 60 Hz), GameFlow, MissionRuntime +
  analyzeMission (solvability), difficulty + adaptive assist, save system (envelope, checksum,
  double-buffered slots, schema, migrations, SaveManager exit policy, IndexedDB + Capacitor
  Preferences mirrors, exit triggers), InputManager (gamepad/keyboard/touch, families, remap,
  disconnect), content schema + validateChapter.
- src/game.ts composition root wires everything; Android pause and Back hooks.
- Tests: 84 unit (Vitest) + 7 E2E (Playwright, Galaxy landscape): boot with zero console output,
  BRIEF 8.H save matrix, controller hides touch UI, disconnect pauses. E2E is a CI gate.
- Research pass 2 done for Prologue, Ch1, Ch2 (research/ch0N-*.md, research/sources-ch0N.md).

## Research status (must be closed by a FRESH fact-checker before each chapter is built)
- Many sites blocked the agents (Britannica, IPS, PalQuest, UNRWA, NLI: 403; Wayback refused).
- Prologue: 42 sources, only 7 non-Wikipedia pages read. Palestinian, Druze, Bedouin, Old Yishuv
  voices thin. Congress attendance figures unverified.
- Ch1: 57 sources, 26 fetched. Peel, Shaw, Survey of Palestine tables unread. Israeli scholarship
  only via indexes.
- Ch2: 69 sources. Operation dates verified and corrected. UN texts are NOT freely redistributable
  (see DESIGN decision log). Convoy of the 35, IDF ordinance date, casualty splits unverified.
- Rule: [UNVERIFIED]/[BK]/[W-only] claims never reach quiz, facts, codex or archive.
- Next research move: try alternative access (Google Books previews, JSTOR open, university
  repositories, archive.org full texts) and merge per-chapter registers into SOURCES.md.

## M2 status (2026-11-04): DONE, released as v0.2.1 (v0.2.0 tag has no release: the release step bug was fixed after it)
Playable: Prologue (archive-night, jaffa-letters) and Ch1 (tower-stockade, night-landing, the-vote) with
the full chapter flow (hub, timeline, content note, briefing, missions, cutscenes, debrief ledger, quiz).
Reviews done by fresh agents: content (ch00/ch01), 1948 timeline/lenses fact-check, QA and balance,
code review (7 findings fixed), accessibility review (all High and Medium fixed).

## Ch2 prerequisites (before building Chapter 2)
- Upgrade secondary citations in 1948 captions (Rabin paraphrase, Morris 50,000) to primary/book sources;
  add Palestinian-lens counterparts for Negba and Kfar Etzion captions.
- Precisely sourced coordinates for the 1947 partition and 1949 armistice line layers (empty today).
- Verify Living Map relief control points GEO-001..004 against opened sources.

## M3 backlog (from M2 reviews)
- Deepen missions to their design length with designed beats (DESIGN.md decision log), human playtest on S26.
- Accessibility Low items 1-5, 7-9, 11-12 (docs/ACCESSIBILITY_REVIEW_M2.md); UI text-size setting.
- Per-mission briefing context keys for night-landing and the-vote (LevelDefinition.briefingContextKey).
- Pause-menu Codex inside missions; HUD prompt refresh on the same focus target (the-vote).
- On-device checks: Ultra 60 fps, subtitles above letterbox, focus rings, gamepads in the WebView.

## DONE: on-device feedback fixes for v0.2.1 (phone UX, touch look, frame-mode loop, layout owner,
bug hunt, touch paths for every level action). Merged into main.

## SCOPE RULE (user, 2026-11-04): Chapter 1 must be perfect first
Do NOT start Chapter 2 or later (research, content, levels, 1949 map lines) until the user says the
Prologue and Chapter 1 are perfect and we align together. Ch2/Ch3/Ch4 research agents were stopped.

## Chapter 1 polish wave: DONE and merged (2026-11-04)
- Missions deepened: archive-night (lens-order root fix), jaffa-letters (cart ride + stretch moments),
  tower-stockade (stakes, field-edge talk, 2 decisions), night-landing (second rescue wave, 9 checkpoints),
  the-vote (camera spawns, decision feedback).
- Audio polish (motif score, era profiles, beds, ducking, limiter), visual polish, a11y round 2.
- Performance: shader depth materials, incremental time-boxed warm-up (ANR fix), Battery budget met,
  allocation-free collision (docs/PERF_REPORT.md).
- Controller QA spec (CONTROLLER_QA=1, ~47 min, not in CI); CQA-1..3 fixed.
- Code review (7 findings) and content/Hebrew review (36 strings) applied.
- Night Landing E2E no longer self-skips.
Next: release v0.2.2 (tag after green CI), Hebrew update, ask the user to play and confirm Chapter 1.

## Open after v0.2.2 (Chapter 1 only)
- Per-frame allocations 17-39 KB (target <5 KB): three.js internals, terrain LOD, R7 (jaffa step,
  landing SurvivorViews.sync). Measure on the phone first.
- Text size via --nv-ts in timeline.css, livingMap.css, tower.css; a11y Low items 4, 5, 7, 8, 9, 11, 12.
- Mission length: jaffa ~4-5 min and tower ~8-10 min estimated vs design 15-18 (no padding; fun first).
- Ultra 60 fps on a real S26 Ultra is unconfirmed; ask the user.

## Next: after the user confirms Chapter 1
Ch2 prerequisites above, then Ch2 pipeline (research, content, 5 missions, fact-check, QA).

## Old M2 plan (kept for reference)
1. M1 review findings are fixed (see QA_REPORT). Graphics agent must add a GameScene hook to rebuild GPU-only state after webglcontextrestored.
2. Fan out system agents in worktrees (CONTRACTS.md ownership map): Graphics & Settings, Controls
   (touch UI + glyphs + remap UI + Android gamepad check), Save UX (pause menu, slots, exit prompt),
   Audio, UI/Menus + focus navigation, Cinematics, World & Art.
3. Fact-checker pass on Prologue research, then build the Prologue + one full chapter (Ch1 Roots)
   as the vertical slice.
4. Main menu with every setting, timeline + Living Map v1, tutorial.
5. Measure on device: Ultra budgets on the S26 Ultra (user plays the APK).

## Phase 2 backlog (do not build until the user writes "start Phase 2")
- English, Arabic, Russian locales + fonts + multi-language QA
- Strict CSP, claude-security scans, SHA-pinned actions, npm-audit deploy gate
- GitHub Pages PWA, Service Worker, APK download page, iOS/Firefox/desktop testing
- 2D Canvas Lite Mode
- Low-tier performance targets (6x throttle at 30 fps, at most 150 draw calls)
- Teacher/Classroom mode
- Colorblind modes, high-contrast UI, dyslexia-friendly font, auto-play learning mode

## Decisions log
- 2026-11-03: Title "Netivim" (Hebrew for "Paths"); repo leelor123/netivim; appId io.github.leelor123.netivim.
- 2026-11-03: TypeScript pinned to 6.0.3 because typescript-eslint 8.72 supports TS below 6.1.
- 2026-11-03: minSdk raised from 24 to 26 so the launcher icon is fully vector (adaptive icon).
- 2026-11-03: npm audit reports moderate advisories in dev-only tooling (glob/minimatch via
  @capacitor/cli and eslint). Not shipped in the APK; the audit gate is a Phase 2 item.
- 2026-11-03: Gamepad device switching is edge-triggered (new input only), found by E2E.
- 2026-11-03: E2E ignores only Chromium software-GL driver performance notes (not game output).
