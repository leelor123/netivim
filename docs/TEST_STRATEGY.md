# Test strategy

Status: M1 (2026-11-03). Goal from the brief: no bugs, no softlocks, no lost saves, smooth 60 fps.

## Pyramid
| Layer | Tool | Where | When it runs |
|---|---|---|---|
| Unit (many, ms each) | Vitest, node env | tests/unit | every commit, CI gate |
| Content validation | Vitest | tests/content | every commit, CI gate |
| Solvability (graph) | Vitest | tests/solvability | every commit, CI gate |
| E2E (browser, mobile emulation) | Playwright, Chromium, Pixel 7 + Galaxy S landscape | tests/e2e | milestone + before release |
| Visual baselines | Playwright screenshots per preset | tests/visual | milestone |
| Soak (30 min) | Playwright + renderer.info counters | tests/soak | final, and when memory code changes |
| Android smoke | GitHub Actions emulator (API 34), adb | CI release job | every release tag |

Rules: tests are deterministic (fixed timestep, seeded randomness, fake clocks). No test sleeps
on wall time; the game exposes a test hook (window.__netivim, only when built with
VITE_TEST_HOOKS=1) to step the simulation and read state.

## Unit coverage targets (statements >= 90% for src/core)
| Area | Must cover |
|---|---|
| GameLoop | fixed steps at 30/60/144 Hz, max-steps clamp, pause stops steps, alpha in [0,1) |
| FSM | allowed and forbidden transitions, guards, enter/exit hooks order, reachability helper |
| EventBus | typed emit/on/off, unsubscribe during emit, no leaks after off |
| Save | envelope checksum, A/B flip, torn write recovery, corrupted JSON, wrong version migration, size limit, quota error, newest-wins across backends, exit policy matrix (menu / mid-mission / mid-mission after manual / mid-cutscene) |
| i18n | placeholders, missing keys, every key used in code exists in he.json |
| Input | binding map, remap persistence, device switching, gamepad family detection, disconnect pause event, dead zones |
| Content validators | missing source IDs, unknown locale keys, missing labels, bad quiz answers, duplicate IDs |
| Quiz / difficulty | scoring, retries, rewards, difficulty multipliers per level, adaptive assist offer after 2 fails |

## E2E journeys (fail on any console error or warning)
1. Boot to title, no console output, WebGL2 canvas present.
2. Menus fully with keyboard and with mocked gamepad only (navigator.getGamepads stub).
3. Controller connect hides every element with data-touch-ui; first touch restores them;
   disconnect mid-mission opens pause.
4. Save lifecycle: dispatch visibilitychange and pagehide in the four BRIEF 8.H situations,
   reload, assert resume point.
5. Every chapter loads lazily and its loading screen finishes.
6. QA bot plays every mission via the test hook (scripted inputs), reaching complete.
7. Settings: each preset applies live and persists across reload.

## Solvability
Each mission exports its FSM definition plus bot scripts per checkpoint. The test proves
(a) every state is reachable from start, (b) complete is reachable from every reachable state,
(c) restart-from-checkpoint exists in every non-terminal state, and (d) the bot completes the
mission from each checkpoint on every difficulty.

## Visual QA
Key scenes x presets (Battery Saver, Low, Medium, High, Ultra) screenshots with a 0.2% pixel
tolerance, plus a manual artifact review checklist (shadow acne, peter-panning, z-fighting,
aliasing, banding) recorded in QA_REPORT.md.

## Performance checks
Bundle size gate (initial JS <= 600 KB gzip) in CI; per-frame allocation test in the soak;
renderer.info draw calls and triangles asserted per preset against DESIGN.md budgets.

## Gaps today (M1 start)
No E2E, no save tests, no input tests, no content validators: built during M1 core work.
Android emulator smoke and visual baselines arrive in M2.
