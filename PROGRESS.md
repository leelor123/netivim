# Progress

## Milestone status
- [x] M0 Setup: project, pinned stack, skills, Capacitor Android, signing secret, CI release
- [ ] M1 Design + core
- [ ] M2 Vertical slice
- [ ] M3 Act 1 (Prologue + Ch1-4)
- [ ] M4 Waves (Ch5-11 + Epilogue)
- [ ] Final polish (end of Phase 1)

## Done (M0)
- Vite + TS strict + three 0.186.1 + Vitest + ESLint (0 warnings), lockfile.
- three.js skill pack in .claude/skills/ (real copies, not symlinks).
- Placeholder title screen: procedural low-poly hills, instanced trees, AgX tone mapping, Hebrew RTL.
- WebGL2 check with a Hebrew error; Android Back button opens a pause overlay (never exits).
- Capacitor 8 Android: landscape, immersive (no bars), keep-awake, no INTERNET permission,
  vector adaptive icon + splash, minSdk 26.
- Release keystore generated outside the repo, stored as GitHub secrets.
- CI: lint, typecheck, tests, signed APK, apksigner verify, GitHub Release on v* tags.

## Next (M1): exact next steps
1. superpowers:brainstorming (autonomous) to write docs/DESIGN.md: title, loop, chapter/mission
   table, difficulty, save design, budgets, at least 10 original features.
2. ADRs in docs/adr/ (loop, state machines, save, content schema, input, rendering presets).
3. engineering:testing-strategy to write docs/TEST_STRATEGY.md; add Playwright (mobile emulation).
4. Lead builds CORE: fixed-timestep loop, scene manager, input abstraction (gamepad/touch/keys),
   save core (atomic, checksummed, versioned), content schemas + build-time validation,
   mission state-machine framework. Write docs/CONTRACTS.md.
5. In parallel: Historian agents research Prologue, Ch1, Ch2 into research/chNN.md and SOURCES.md.

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
