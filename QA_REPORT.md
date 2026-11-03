# QA report

## M1 (2026-11-03)
| Check | Result | Evidence |
|---|---|---|
| ESLint 0 warnings, tsc strict | pass | npm run lint, npm run typecheck |
| Unit tests | 84/84 pass | npm test (events, fsm, loop, flow, mission, difficulty, save, input, content, i18n) |
| E2E | 7/7 pass | npm run e2e, Chromium, Galaxy S9+ landscape emulation |
| BRIEF 8.H save matrix | pass | unit + E2E (menus saves; mid-mission keeps stable; after manual saves; mid-cutscene keeps stable) |
| Torn write, corruption, full storage, WebView data loss | pass | tests/unit/save.test.ts |
| Controller hides touch UI, touch restores, disconnect pauses | pass | tests/e2e/core.spec.ts |
| Bundle size | 145.6 KB gzip (budget 600 KB) | npm run build |
| Independent code review | see below | fresh reviewer agent |
| On-device (S26 Ultra), real controllers in WebView | not yet verified | needs the user, planned M2 |

## M0 (2026-11-03)
| Check | Result | Evidence |
|---|---|---|
| ESLint, 0 warnings | pass | npm run lint, local and CI |
| tsc strict | pass | npm run typecheck |
| Unit tests | 5/5 pass | npm test (i18n + locale file) |
| Production build | pass, 139.6 KB gzip JS | npm run build |
| Title screen renders, no console messages | pass | local preview in Chromium |
| Signed APK | pass, 3.1 MB, APK Signature Scheme v2, cert SHA-256 ef0b4665...3ca5ff matches keystore | CI run 41637157169 (apksigner verify) |
| On-device check (S26 Ultra) | pending | user installs v0.0.1 |

Not yet covered (planned M1-M2): Playwright E2E, controller E2E, save tests, visual baselines,
Android emulator smoke test.
