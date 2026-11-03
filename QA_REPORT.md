# QA report

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
