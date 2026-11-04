# Performance report: Prologue and Chapter 1 (M3)

Scope: the hub and the five Phase 1 missions (archive-night, jaffa-letters, tower-stockade,
night-landing, the-vote). Target: Ultra on Galaxy S26 Ultra, locked 60 fps, no hitches, no
per-frame allocations, no long tasks over 50 ms, flat memory over 30 minutes.

## How it was measured

| Suite | What | Command (after `npm run build:test`) |
|---|---|---|
| `tests/perf/scenes.perf.ts` | draw calls, triangles, programs, geometries, textures, JS heap, frame-time distribution, scene audit; every scene x every preset (fresh level build per preset) | `PW_PORT=4178 npx playwright test -c tests/perf/playwright.config.ts scenes` |
| `tests/perf/alloc.perf.ts` | bytes allocated per frame with the V8 sampling heap profiler (collected objects included), top allocation sites, program-churn guard | `npx vite build --mode test --outDir test-results/dist-perf --minify false` then `PERF_DIST=test-results/dist-perf PW_PORT=4178 npx playwright test -c tests/perf/playwright.config.ts alloc` |
| `tests/soak/soak.soak.ts` | 30 simulated minutes, all five missions in a loop through the real director, renderer and post chain; GPU counts and heap after every hub visit | `PW_PORT=4178 npx playwright test -c tests/perf/playwright.config.ts soak` |
| `tests/perf/renderPerf.test.ts` | unit tests for the fixes (part of `npm test`) | `npm test` |

Environment: headless Chromium 1.64 (SwiftShader software GL, no `KHR_parallel_shader_compile`),
Galaxy S9+ landscape viewport at DPR 1, adaptive quality off. Counts (calls, triangles, programs,
geometries, textures) are exact and device independent. Frame times are a RELATIVE signal only:
software GL renders Ultra at 1.6-2 fps, so they say nothing about the S26 Ultra. Raw data:
`test-results/perf/{scenes,alloc,soak}.json`.

## Measured numbers (after the fixes)

Per-frame totals (shadow pass + scene + every post pass), worst frame in a 2.5 s window at the
mission's start view. Heap = JS heap after a forced GC.

| Preset | Scene | Draw calls | Triangles | Programs | Geometries | Textures | Heap MB |
|---|---|---|---|---|---|---|---|
| Ultra | hub | 37 | 127k | 39 | 12 | 26 | 24 |
| Ultra | archive-night | 49 | 25k | 32 | 19 | 28 | 25 |
| Ultra | jaffa-letters | 133 | 119k | 34 | 99 | 26 | 34 |
| Ultra | tower-stockade | 139 | 24k | 35 | 69 | 26 | 15 |
| Ultra | night-landing | **268** | 73k | 41 | 229 | 26 | 31 |
| Ultra | the-vote | 59 | 12k | 36 | 35 | 26 | 15 |
| High | hub | 32 | 127k | 34 | 12 | 20 | 20 |
| High | archive-night | 44 | 25k | 27 | 19 | 22 | 22 |
| High | jaffa-letters | 128 | 110k | 29 | 99 | 20 | 32 |
| High | tower-stockade | 134 | 24k | 30 | 69 | 20 | 15 |
| High | night-landing | 180 | 31k | 36 | 213 | 20 | 40 |
| High | the-vote | 51 | 12k | 31 | 32 | 20 | 38 |
| Medium | worst (night-landing) | 162 | 29k | 25 | 210 | 5 | 37 |
| Low | worst (night-landing) | 149 | 25k | 22 | 209 | 3 | 28 |
| Battery | worst (night-landing) | **147 (> 120)** | 24k | 10 | 195 | 1 | 27 |

Every scene is far inside the provisional High (400 / 1.5M) and Ultra (600 / 3M) budgets. The
heaviest scene is night-landing (draw calls); the heaviest triangle count is the hub (127k).
The only budget miss is night-landing at Battery Saver (147 draw calls, budget 120); Low is at
149 of 150. Both are level-side (see recommendations).

Soak (30 simulated minutes, 5 cycles, Ultra): after every hub visit geometries 12, textures 26,
programs 39, identical from the first visit to the last. Every mission holds the same geometry
and texture count on every visit (archive-night 24/29, jaffa 100/26, tower 80/26, night-landing
332/26, vote 37/26). JS heap floor per cycle: 20.3, 20.9, 22.6, 21.2 MB: flat.

Per-frame allocations (Medium, JIT warmed by 1200 simulation steps, ~40-70 frames sampled):
hub 28 KB, archive-night 26 KB, jaffa 63 KB, tower 34 KB, night-landing 60 KB, vote 29 KB per
frame. Software GL inflates frame times, not allocations; on the phone this is roughly 1.5-4 MB/s
of short-lived garbage: minor GCs (about 1 ms each) every 1-2 s, not 50 ms pauses, but it is not
"zero". Owners are listed below.

Bundle: initial JS 253 KB gzip (budget 600 KB); post chain is a lazy 56 KB chunk; each level is
its own 10-16 KB chunk.

## What was wrong and is fixed (src/render, src/world)

1. **Shadow depth program churn every frame, every scene** (`renderPipeline.ts`). three.js draws
   all shadow casters with ONE shared depth material. Every scene mixes instanced casters (scatter,
   figures, books, wall modules) with plain ones, so that material flipped its instancing variant
   several times per frame and each flip re-ran `getProgram` (parameter object + cache-key string).
   Measured 12-20 KB/frame of garbage plus CPU per scene. Instanced casters now get a
   pipeline-owned depth material (plain and instance-color variants), assigned at scene warm-up and
   on a 1 s rescan. getProgram churn is gone from archive-night, jaffa-letters and the-vote.
2. **Post chain rebuilt on every scene switch** (`renderPipeline.ts`, `post/chain.ts`). Each switch
   disposed and re-created every composer render target and re-linked a dozen post shaders on the
   first frame of the new scene (the visible hitch when a mission starts at High/Ultra). The chain
   is now retargeted (`PostChain.retarget`): scene pass, GTAO and bokeh point at the new scene and
   camera; buffers and programs stay.
3. **Shader compile hitch on first view** (`renderPipeline.ts`). A newly active scene is
   precompiled with `renderer.compileAsync` (KHR_parallel_shader_compile: the Android WebView links
   off the main thread) before it is drawn; meanwhile the canvas keeps the previous frame
   (max 2 s, `WARMUP_TIMEOUT_MS`). Without the extension it falls back to a synchronous
   `renderer.compile` at the switch. `pipeline.ready` is false while warming.
4. **LOD cross-fade program linked mid-play** (`world/terrain.ts`). The alpha-hash fade variant was
   compiled on the first LOD switch while walking. A hidden carrier mesh (shared geometry, never
   drawn) puts it in the scene so the warm-up above links it at load.
5. **Shadow-map leak: +2 GPU textures per archive-night visit** (`sceneManager.ts`). Level scenes
   free only the sun and hemi light; the archive room's other shadow-casting lights kept their
   shadow render targets forever. `SceneManager.switchTo` now disposes every light of the outgoing
   scene (idempotent). The soak caught it (textures 26 -> 28 -> 30 -> 32), now flat at 26.
6. **Old scene retained through the shadow sun** (`renderPipeline.ts`). After leaving a sunlit level
   for the hub (no `sun`), the pipeline kept a reference to the level's DirectionalLight, whose
   parent chain held the whole level graph (10-17 MB of CPU geometry) until the next sunlit scene.

Verified, no change needed: terrain LOD (3 levels, hysteresis, cross-fade, unit tested); instancing
in scatter / figures / tower walls; frustum culling on everything except deliberately unculled
instanced groups (13-14 per mission, tiny); shadow camera fitted every frame to the bounding sphere
of the view frustum up to `shadowDistance` (60 m for levels, 80 m default) with texel snapping and
texel-derived bias; the debug overlay refresh allocates nothing.

## Recommendations for level and scene owners (not edited: other agents' files)

| # | File | Problem (measured) | Fix |
|---|---|---|---|
| R1 | `src/levels/ch01/landing/visuals.ts:109` (`ConeFan`) | transparent + DoubleSide fans: three.js renders them in two passes and sets `material.needsUpdate` twice per frame each (186 version bumps in 2 s), re-running getProgram: 22 KB/frame on night-landing | add `forceSinglePass: true` to the fan material (flat fan, back faces need no sorting) |
| R2 | `src/levels/ch01/tower/site.ts:201` (searchlight beam) | same two-pass transparent DoubleSide pattern | `forceSinglePass: true` |
| R3 | `src/levels/ch01/tower/site.ts:51` (`Inst`) | wall modules / gravel are InstancedMesh with the kit `solid` material that 58 plain meshes also use: the program variant flips during the opaque pass (8.5 KB/frame) | pass a dedicated material, e.g. `world.bag.material(world.mats.solid.clone())`, for instanced rows |
| R4 | `src/scene/hubScene.ts:286,294` (docs, books) | same: `mats.solid` on 2 InstancedMesh and 2 plain meshes (8 KB/frame in the hub) | clone `mats.solid` for the instanced shelves |
| R5 | `src/levels/ch01/night-landing.ts` + `landing/*` | 507 meshes, 195-229 geometries, 147 draw calls at Battery Saver (budget 120), 149 at Low (150) | merge static beach / dune / boat props per material with `bakePlacements` (as `LevelWorld.place` does), or instance repeated props; skip decorative props below tier 2 |
| R6 | `src/gameplay/core/collision.ts`, `orbit.ts`, `movement.ts` (shared runtime) | top game-side allocation sites in every mission: `pushOut`/`resolveCircle` 5-16 KB/frame, `safeDistance`/`rayEntry` 2-8 KB/frame, motor `update` 2-5 KB/frame. The code itself creates no objects there, so the likely cause (not yet proven) is V8 boxing doubles: fields stored as tagged values (collider literals in two shapes, with and without `height`, some created with integer coordinates) get a new HeapNumber on every double write | profile with `alloc.perf.ts` on an unminified build after: one collider shape per kind (always set `height`), numeric fields initialised with doubles, indexed loops instead of `for...of` over collider arrays |
| R7 | `src/levels/ch00/jaffa-letters.ts` (level `update`), `src/levels/ch01/tower-stockade.ts` (`refreshTargets` / visual hook), `src/levels/ch01/landing/visuals.ts` (`sync`) | anonymous functions inside the level step show up as allocation sites (jaffa ~4 KB/frame, tower ~1.7 KB/frame, night-landing ~3 KB/frame) | check for closures, array literals or spread created per step there and hoist them |
| R8 | `src/gameplay/director.ts` (cleanupMission) | the last level stays reachable for a while after returning to the hub (heap 21 MB vs 41 MB after jaffa, nondeterministic, freed by the next scene switch; not a leak: the floor is flat) | when the hub replaces the level scene, call `host.dispose()` and drop `levelDef`; check toasts / screen closures for references to the host |

## Follow-up pass: status of R1-R8 and the shader warm-up

| # | Status | Before -> after (same suites, same environment) |
|---|---|---|
| R1, R2 | done: `forceSinglePass` on ConeFan and the tower beam | night-landing program churn 26 KB/frame -> 0 |
| R3, R4 | done: instanced rows (tower) and shelves (hub) use a clone of the kit material | churn hub 8.5 KB -> 0, tower 8.9 KB -> 0 |
| R5 | done: night-landing static sea / beach props merged per material (`StaticBatch`) | Battery 147 -> **115** calls (budget 120), Low 149 -> 117 (150) |
| R6 | done: collision / camera hot paths (see below) | per-frame totals: hub 29 -> 19.5 KB, archive-night 25 -> 12.8, jaffa 61 -> 40, tower 40 -> 26.6, night-landing 63 -> 29, vote 26.5 -> 21.8 |
| R7 | open | jaffa level step ~2.6 KB/frame, landing `SurvivorViews.sync` ~1.5 KB/frame (double arguments to `Crowd.set` per survivor) |
| R8 | done: a level whose scene is still on screen when the mission ends is disposed on the first frame after the switch; `levelDef` dropped at hub / title; the post chain and the warm-up drop the previous scene on switch | not re-measured with the soak suite |

`KNOWN_OVER` (scenes) and `KNOWN_CHURN` (alloc) are gone: every scene / preset budget and the
zero-churn rule are enforced.

R6 findings. The headless profile runs much of the game in V8's mid tier (Maglev); there a double
passed to a call that is not inlined, or a float merged across branches, becomes a HeapNumber.
`pushOut` / `rayEntry` were called once per collider per step with five double arguments. Now the
per-collider work reads a Float64Array scratch, far colliders are rejected inline (same answer,
bit-identical: `tests/unit/collisionHotPath.test.ts` against reference copies of the old code),
and colliders have one shape per kind. Measured with `performance.memory` and no profiler
attached: `CharacterMotor.update` 2465 -> 137 B/step (archive-night), 2465 -> 1189 (jaffa,
76 colliders, many near), 2465 -> 162 (vote). What remains per frame is mostly three.js itself
(`painterSortStable`, uniform upload `setValueV3f` / `setValueM4`, `setProgram`), the level-kit
update (terrain LOD) and R7; it is far above the 2 KB target and is not enforced by the suite.
These are mid-tier numbers: on the phone, hot functions reach TurboFan sooner and box less.

Shader warm-up (src/render/shaderWarmup.ts). The previous warm-up ran `renderer.compile(scene)`
for the whole scene in one call without KHR_parallel_shader_compile, and `compileAsync` (also a
whole-scene compile() first) with it. On a slow GPU that is one main-thread block of seconds,
which starves the WebView's input dispatch (ANR suspect). Now:
- One object per material variant is compiled at a time, at most 8 ms of main-thread work per
  frame. Without the extension each program's link is forced right after its compile (one
  program per stall), with it the links are polled with the non-blocking status query.
- No work while `document.hidden`; hidden time and frame gaps over 250 ms do not count toward
  the 2 s cap. Resume and visibilitychange never compile; a restored context warms again,
  incrementally.
- The hub veil and a mission veil (same look, no new text) stay up until the scene is warmed and
  drawn; `MissionHost.update` does not run while the warm-up holds the scene
  (`RenderPipeline.holdsSimulation`, wall-clock fallback at twice the cap for frame-less tools).
- What can still block: a single program link without the extension (tens to a few hundred ms on
  software GL, one per frame), and, if the 2 s cap is hit, three.js compiling whatever is left
  on the first draw (the old behaviour, now only for the remainder).

## Budgets to record in CLAUDE.md (replacing the provisional line)

Measured worst case over the hub and all Phase 1 missions, with headroom for later chapters:

- **Ultra**: at most **450 draw calls / 1.0M triangles / 60 programs** per frame (measured worst
  268 / 127k / 41). GPU counts flat in the 30-minute soak (geometries, textures, programs).
- **High**: at most **300 draw calls / 750k triangles / 50 programs** (measured worst 180 / 127k / 36).
- Medium / Low / Battery keep DESIGN 8 (250 / 150 / 120 draw calls); night-landing must meet
  Battery 120 (R5).
- Per frame: zero `getProgram` churn (guarded by `alloc.perf.ts`); total short-lived allocation
  target below 2 KB per frame (today 26-63 KB, owners R1-R7).
- Long tasks: none during play; a level build (behind the briefing) is a load task, measured by
  the scenes suite but not bounded by the 50 ms rule.

These replace the provisional "High 400 / 1.5M, Ultra 600 / 3M" with tighter numbers that the
current content meets with 40 % headroom. They still need one confirmation run on the S26 Ultra
with the debug overlay (frame time at Ultra in night-landing and the hub, the two heaviest scenes).

## Regression runs (PW_PORT=4193)

`core`, `graphics`, `world` E2E: 17/17 pass with these changes. `level-ch00-archive` fails at the
"two lenses" sheet (`.an-sheet` never shows the second lens text) both with and without these
changes (same failure on a build of HEAD), so it is pre-existing and level-side.

## Not verified here

- Real frame times on the S26 Ultra (no device; software GL frame times are not comparable). The
  one-line device check: install the APK, enable the debug overlay, play night-landing at Ultra.
- Shader warm-up with KHR_parallel_shader_compile runs only on GPU builds (Android WebView); the
  headless suite exercises the incremental path without it (forced link per program).
