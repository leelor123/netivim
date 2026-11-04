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

## IN PROGRESS: on-device feedback fixes for v0.2.1 (user, 2026-11-04, touch only on S26)
User report: screen cluttered / not clean; cannot look around with touch; walking feels buggy; find and
fix all bugs at the root.
Root causes found (evidence: phone-ratio captures via scripts/hudshot.mjs):
- Walking stutter: fixed 60 Hz steps on a 120 Hz display, no interpolation. FIXED (GameLoop frame mode).
- Touch look: InputManager.look is fed only by the gamepad right stick; touch/mouse never feed it.
- Clutter: no single owner of screen layout. Two pause buttons (HUD + touch), quick-save and unsaved
  pills, tutorial banner mid-screen, four big touch buttons (map and pause duplicate the HUD), and the
  subtitle box overlaps the testimony/label panel at the bottom (bug). Briefing at phone size pushes
  the Start button below the fold.
MERGED: phone UX (touch/mouse look, src/ui/layout.ts regions, one caption, two touch buttons, sticky
sheet footers; CONTRACTS 14). Follow-up running: touch paths for every level action (Tower planning
table had none: touch softlock risk). Previously running (worktrees): phone UX agent (touch/mouse look, single screen-layout owner, one caption box,
fewer touch buttons, sticky sheet footers) and a bug hunter (all 5 missions, non-UI fixes; reports
UI bugs). Then: merge both, fix reported UI bugs, full CI, release v0.2.2 with a Hebrew update.

## Next: M3 (Act 1 = Prologue + Ch1-4) exact next steps
1. Get the user's on-device feedback on v0.2.1 (Ultra fps, controllers in the WebView, subtitles, focus).
2. Ch2 pipeline: Ch2 prerequisites above, then content writer, level builders (5 missions), fresh fact-check, QA.
3. Ch3 and Ch4 historians in parallel (research only), then their pipelines.
4. Deepen Prologue and Ch1 missions to design length (M3 backlog).

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
