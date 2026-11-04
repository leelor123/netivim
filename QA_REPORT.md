# QA report

## M2 release v0.2.1 (2026-11-04)
| Check | Result | Evidence |
|---|---|---|
| Unit + content + solvability + QA tests | 600/600 pass | npm test |
| E2E (Playwright, Android landscape emulation) | all pass in CI | GitHub Actions run 41757618469 |
| Android emulator smoke (launch, immersive, landscape, background/resume, Back) | pass | same run |
| Signed APK published | netivim.apk 3.46 MB | releases/tag/v0.2.1 |
| Independent code review | 7 findings fixed | fix: M2 code review findings |
| Accessibility review | all High and Medium fixed | docs/ACCESSIBILITY_REVIEW_M2.md |
| Content reviews (ch00, ch01, 1948 timeline) | done | research/review-*.md |
| Not verified | Ultra 60 fps on S26 Ultra, gamepads in the Android WebView, on-device subtitles and focus | needs the user |

## M2 missions: balance and fairness pass (2026-11-04)
Scope: Prologue (archive-night, jaffa-letters) and Chapter 1 (tower-stockade, night-landing, the-vote).
Method: `tests/qa/driver.ts` replays each level with the solvability bot on the fixed 1/60 s step and records checkpoint times, objectives, alerts and subtitles. `tests/qa/balance.test.ts` turns the measurable rules into regression tests (about 50 assertions, 13 s). `tests/qa/estimate.test.ts` computes the time table (`QA_DUMP=<file>` writes JSON). A first-time human is modelled as 1.5x slower than the bot; reading is 12 Hebrew words per second.

### Checkpoint spacing, objectives, alerts (the bot route is identical on Story, Normal and Challenge)
| Mission | Bot play | Gaps between checkpoints (s, bot) | Slowest gap x1.5 | Objective always shown | Max danger meter (Story / Normal / Challenge) |
|---|---|---|---|---|---|
| archive-night | 0.5 min | 2, 6, 4, 14, 2, 6 | 21 s | yes (0 steps without) | 0 |
| jaffa-letters | 2.6 min | 4, 14, 43, 37, 5, 13, 7, 35 | 65 s | yes | 0 |
| tower-stockade | 1.6 min | 9, 24, 17, 41, 7 | 62 s | yes | 0 (sunset meter) |
| night-landing | 2.7 min | 12, 27, 42, 18, 66 | 99 s | yes | 0.45 / 0.72 / 0.90, never 1 (never seen) |
| the-vote | 2.2 min | 2, 23, 60, 2, 46 | 90 s | yes | 0 |

Rule "checkpoint at most 3 min of play apart": pass everywhere with a large margin (worst 99 s with the slow human).

### Telegraphed threats (probe stands in the danger until it triggers; warning = time from first meter above 0 to the fail)
| Threat family | Count | Warning Story / Normal / Challenge (required) | Result |
|---|---|---|---|
| Night Landing patrol boat cones (2 lanes + 1 preview) | 3 | 4.0 / 2.5 / 2.0 s | pass |
| Night Landing shore searchlights (audio tick 2 s before each sweep) | 2 | Normal 2.5 / Challenge 2.0 s; on Story a beam crosses a standing point for 3.9 s, less than 4 s, so it never catches the player | pass |
| Night Landing beach watcher | 1 | 4.0 / 2.5 / 2.0 s | pass |
| Jaffa sown fields (field warning line) | 5 | 4.0 / 2.5 / 2.0 s | pass |

Archive Night and The Vote have no hazards.

### Timers a first-time player can meet (test: base x scale >= 2 x (bot time x 1.5))
| Timer | Base | Story / Normal / Challenge | Bot time | Verdict |
|---|---|---|---|---|
| Tower day clock (planning pauses it) | 600 s | 960 / 600 / 480 s | 98 s | fair |
| Landing before dawn | 150 s | 240 / 150 / 120 s | 18 s | fair |
| Shore before dawn | 330 s | 528 / 330 / 264 s | 56 s | fair |
| Station bell (starts after the ticket) | 45 s | 72 / 45 / 36 s | 7 s | fair |

No unfair timer found; none needed tuning.

### Soft-failure loop (every defined failure, all five missions)
Pass: the card data (what-really-happened text, label, hint, sources where documented) is complete; `retry()` restores the checkpoint synchronously and the mission runs again; no assist after failure 1; after failure 2 at the same checkpoint hint and more time (plus extra checkpoint where declared) are offered; nothing is applied until `acceptAssist`; declining does not ask again until 2 more failures; more time only multiplies the timer scale (x1.3).
Findings:
1. (framework, not fixed) `failureScreen` prints `t(reasonKey)` as the card heading. Prologue and The Vote fail with bare ids (`missed-train`, `label-basel`, `icj-misread`, ...), so their cards show the raw id above the sourced text. Request: render the title (`ch00.fail.<id>.title`), or hide the heading when the key is missing, or add a `titleKey` to `FailureInfo`. `balance.test.ts` pins the 9 affected reasons so the fix is noticed.
2. Tower `fail.order` is RECONSTRUCTED and has no source by design (missions.md); the rule is "documented claims need sources".
3. Archive Night fails on the first wrong label sort (by design, it teaches the labels). Consider no fail on Story.

### Quizzes (Prologue and Chapter 1)
Pass: a wrong answer allows a retry (2 wrong picks per question, then the answer is revealed), a late right answer scores, all-wrong and skip-all both finish, zero stars is a valid result, all texts exist. Chapter completion never reads the score.

### Time per mission including reading (Normal; Story and Challenge differ by under 1 s)
Estimate = per checkpoint segment max(1.5 x bot time, narrated subtitle time) + 15 s orientation + briefing reading + chapter cutscene (archive-night 75 s, the-vote 90 s) + 20 s debrief. The quiz adds 2.7 min (Prologue) and 3.3 min (Ch1) per chapter. This is a LOWER BOUND: the bot knows the route, never hesitates, skips optional discoveries and does not think through puzzles.
| Mission | Model min | DESIGN target | Model / target |
|---|---|---|---|
| archive-night | 2.8 | 12 | 23% |
| jaffa-letters | 4.7 | 18 | 26% |
| tower-stockade | 3.3 | 15 | 22% |
| night-landing | 4.8 (4.6 before the new beats) | 18 | 27% |
| the-vote | 5.8 | 12 | 48% |

Calibration: Night Landing is reported at 8-10 minutes by hand, about 1.9x the model. Applying that factor gives roughly 5.5 / 9 / 6.5 / 9.5 / 11 min, so every mission, not only Night Landing, is about half of its DESIGN target. A human playtest must confirm this.

### Changes made (src/levels/ch01/night-landing.ts only)
1. The warm scarf moment (`ch01.landing.moment`, defined in `LINES` but never played) now plays once on open water after the steering tip: a calm reflective beat in the tense sea stages.
2. Closing breath: when everyone is hidden the mission waits 10 s so Samir's line on the Arab concern (`ch01.landing.d2`, the multi-perspective voice) is heard in full; before, `complete` fired the same step the line started and cut it. The dawn timer cannot fail the mission during this beat. About 17 s of meaning, not padding.
3. E2E `level-ch01-landing.spec.ts` passes (2/2) on a temporary config at port 4391 (deleted).

### Recommendations (need content or framework work)
- Night Landing second rescue wave: the missions.md beat "load passengers into small boats, children and elders first" is built as one boat load. A second crossing (return to the ship, new patrol timing, landing and shore repeated for the elders) is the designed way to reach 15+ minutes; it needs new states, bot steps and tests.
- Tower, Archive Night and Jaffa are far under target; add content already outlined in missions.md (settler and tenant testimonies as a walkable beat, Jaffa optional listening stops, free exploration of the three codex entries).
- The briefing shows ONE context text per chapter (`briefingContextKey`), so Night Landing and The Vote open with the July 1937 tower paragraph. Needs a per-mission key in `ChapterDefinition`.
- Failure heading fix (finding 1).
- Not verified: real device and controller play, human playtest timings.

## M1 (2026-11-03)
| Check | Result | Evidence |
|---|---|---|
| ESLint 0 warnings, tsc strict | pass | npm run lint, npm run typecheck |
| Unit tests | 85/85 pass | npm test (events, fsm, loop, flow, mission, difficulty, save, input, content, i18n) |
| E2E | 8/8 pass, 3 consecutive runs | npm run e2e, Chromium, Galaxy S9+ landscape emulation, 1 worker |
| BRIEF 8.H save matrix | pass | unit + E2E (menus saves; mid-mission keeps stable; after manual saves; mid-cutscene keeps stable) |
| Torn write, corruption, full storage, WebView data loss | pass | tests/unit/save.test.ts |
| Controller hides touch UI, touch restores, disconnect pauses | pass | tests/e2e/core.spec.ts |
| Bundle size | 145.6 KB gzip (budget 600 KB) | npm run build |
| Independent code review | 5 findings, 4 fixed, 1 deferred by design | fresh reviewer agent; see below |
| On-device (S26 Ultra), real controllers in WebView | not yet verified | needs the user, planned M2 |

Review findings (M1): (1) HIGH exit during boot could overwrite the real save with the blank state: fixed with SaveManager.markReady() gate + test. (2) No touch Resume/Save on pause: fixed + E2E. (3) Controller reconnect did not resume: fixed + E2E. (4) Mirror writes could land out of order: fixed by chaining writes per mirror. (5) Scenes must rebuild GPU-only state after WebGL context restore: no such state exists yet; added to the M2 Graphics agent brief.


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
