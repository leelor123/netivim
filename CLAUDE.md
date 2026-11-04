# Netivim (נתיבים) — project guide for Claude

3D educational game (Hebrew, RTL) on the history of Israel's wars. Ships as a signed Android APK.
Source of truth: `docs/BRIEF.md`. Talk to the user in short, plain Hebrew; code/docs/commits in English.

## Session start (every session, also on "continue" / "המשך")
1. Read this file, `PROGRESS.md`, `KNOWN_ISSUES.md`.
2. Run `npm run check`.
3. Take the next unchecked task in `PROGRESS.md`. Don't re-plan what is planned.
Before ending: update `PROGRESS.md` (done / in progress / exact next step), commit, push.

## Config
- MAX_PARALLEL_AGENTS = 15 (user may change it; update here when they do).
- Phase 1 only. Deferred items (docs/BRIEF.md §1A) are NOT built until the user writes "start Phase 2".

## Stack (pinned exactly, lockfile committed)
| Package | Version |
|---|---|
| three / @types/three | 0.186.1 / 0.186.0 (skills target r186, do not bump) |
| vite | 8.3.5 |
| typescript | 6.0.3 (TS 7 not yet supported by typescript-eslint) |
| vitest | 5.1.0 |
| eslint / typescript-eslint | 10.14.0 / 8.72.1 |
| @capacitor/core, cli, android | 8.6.0 |
| @capacitor/app / preferences | 8.1.2 / 8.0.1 |
| @playwright/test | 1.64.1 (Chromium) |
| Node (CI) / JDK (CI) | 24 / Temurin 21 |
| Android | minSdk 26, target/compile 36 |

## Commands
- `npm run dev`: Vite dev server
- `npm run check`: lint + typecheck + unit tests + build (green before every commit)
- `npm test`: Vitest unit tests (`tests/unit/**/*.test.ts`)
- `npm run e2e`: test build (VITE_TEST_HOOKS via .env.test) + Playwright (`tests/e2e`); window.__netivim hook
- `npm run android:sync`: build web + copy into `android/`
- Local APK builds need the Android SDK (not installed on the user PC); CI builds the APK.

## Release (signed APK)
- Push a tag `vX.Y.Z`: `.github/workflows/android.yml` builds, signs, verifies with apksigner,
  and attaches `netivim.apk` to a GitHub Release.
- Stable download link: https://github.com/leelor123/netivim/releases/latest/download/netivim.apk
- versionCode = workflow run number (monotonic). Never rename the workflow file or the counter resets.
- Signing secrets: ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
- Keystore lives ONLY in `C:\Users\User\netivim-signing\` on the user PC and in GitHub secrets. Never commit it.

## Architecture map (contracts: docs/CONTRACTS.md, decisions: docs/adr/)
- `src/main.ts`: boot (i18n, WebGL2 check, UI shell) then `src/game.ts` (composition root)
- `src/core/`: events, fsm (+analyzeMachine), loop, flow, mission (+analyzeMission), difficulty,
  `save/` (envelope, slots, schema+migrations, saveManager, lifecycle, backends), `input/`
- `src/content/`: schema.ts + validate.ts (chapters will live in src/content/chNN)
- `src/render/`: sceneManager (dispose on switch)
- `research/`: per-chapter dossiers and source registers (C1-, C2-, P- IDs)
- `src/scene/`: 3D scenes (procedural only)
- `src/platform/`: Capacitor/Android bridges
- `src/locales/he.json`: ALL visible text (no hardcoded strings)
- `android/`: Capacitor native project. Immersive fullscreen + keep-awake in `MainActivity.java`;
  landscape + no INTERNET permission in `AndroidManifest.xml`; vector icon/splash in `res/`.
- `.claude/skills/`: three.js skill pack (r186). Read the relevant skill before 3D work.
- `docs/`: BRIEF, DESIGN, CONTRACTS, adr/

## Conventions
- TypeScript strict, ES modules, no `any`. ESLint must pass with 0 warnings.
- three.js rules (lint-enforced where possible): `THREE.Timer` not Clock; `renderer.setAnimationLoop`
  not requestAnimationFrame; `PCFShadowMap`; imports from `three/addons/...`; WebGL2 only.
- No allocations in the frame loop; reuse vectors/matrices; dispose geometry, materials, textures.
- Never use innerHTML; use textContent / DOM APIs (lint-enforced).
- No network calls, analytics, CDNs or third-party scripts. Everything is bundled.
- Conventional commits. main is always green.
- Content carries a label (DOCUMENTED / RECONSTRUCTED / FICTIONAL COMPOSITE) and source IDs from SOURCES.md.

## Performance budgets
- Initial JS at most 600 KB gzip (M0: about 140 KB). Menu interactive within 4 s.
- Ultra on Galaxy S26 Ultra: locked 60 fps. No long tasks over 50 ms.
- High/Ultra per-frame budgets, provisional: High 400 draw calls / 1.5M tris, Ultra 600 / 3M.
  Measure on device in M2 and replace with measured numbers.

## Gotchas
- The project path contains Hebrew (`מסמכים`). Some bash heredocs fail to parse here with
  "unexpected EOF while looking for matching quote"; when that happens use the Write tool.
- `keytool` is not on PATH: use `/c/Program Files/Java/jdk-22/bin/keytool.exe`.
- An ECC "GateGuard" hook asks for facts before first-touch file writes and destructive commands.
- Local E2E is slow and timing-sensitive while several agents run software-GL browsers; use
  PW_PORT=<free port> to avoid clashes. CI (one clean machine) is the gate.
- Screenshots: npm run screenshots (Ultra, adaptive off; very slow on software GL).
