# Contracts (owned by the lead)

Only the lead changes this file. Agents that need a change ask the lead. Code is the source of
truth for exact types; this file names them and states the rules. Paths are under src/.

## 1. Events (core/events.ts, type GameEvents)
| Event | Payload | Emitted by | Typical listeners |
|---|---|---|---|
| flow:changed | { from, to } FlowState | game flow FSM | UI, audio, save |
| flow:pause-changed | { paused } | game flow | loop, audio, UI |
| input:device-changed | { device: InputDevice, family } | InputManager | UI (touch hide/show, glyphs) |
| input:gamepad-lost | { index } | InputManager | game flow (pause) |
| input:gamepad-connected | { index, family } | InputManager | UI |
| save:written | { slot, reason } | SaveManager | UI toast |
| save:failed | { slot, reason, error } | SaveManager | UI warning |
| save:dirty-changed | { dirty } | SaveManager | HUD unsaved indicator |
| mission:started | { missionId, checkpoint } | MissionRuntime | save, audio, HUD |
| mission:checkpoint | { missionId, checkpoint } | MissionRuntime | HUD |
| mission:objective | { missionId, objectiveKey } | MissionRuntime | HUD |
| mission:failed | { missionId, checkpoint, reasonKey } | MissionRuntime | failure card, assist |
| mission:completed | { missionId, medals } | MissionRuntime | save (safe moment), debrief |
| unlock:item | { kind, id } | missions, quiz | save (safe moment), toast |
| settings:changed | { settings } | settings UI | render pipeline, audio, save |

Rules: handlers must not throw (EventBus isolates and reports errors); payloads are plain data.

## 2. Game flow (core/flow.ts)
FlowState: boot, title, hub, briefing, mission, cutscene, debrief, quiz.
Volatile states (exit auto-save is restricted): mission, cutscene.
Pause is an overlay flag, not a state.

## 3. Loop (core/loop.ts)
GameLoop.advance(frameSeconds) runs fixedStep(1/60) callbacks up to maxSteps (5) and returns
alpha. Systems implement Updatable { update(dt: number): void } for simulation and optionally
Renderable { render(alpha: number): void }.

## 4. Save (core/save/)
- SaveData (save/schema.ts): version, progress, unlocks, notebook, choices, medals, stats, resume.
- Settings are stored in their own slot "settings" with the same envelope.
- Slots: auto, manual-1, manual-2, manual-3, settings.
- Keys: netivim:<slot>:A and netivim:<slot>:B. Envelope JSON: { v, seq, t, sum, data }.
- SyncStore (getItem/setItem/removeItem) is used for exit-time writes; AsyncStore
  (get/set/remove) mirrors (IndexedDB, Capacitor Preferences).
- SaveManager API: saveManual(slot), autosave(reason), onExit(), loadNewest(),
  load(slot), resetAll(). Exit policy: write auto when flow is stable, or when a manual save
  happened since the current volatile period began. Checkpoints are never written to storage.

## 5. Input (core/input/)
Action names: confirm, back, pause, interact, alt, map, tabPrev, tabNext, up, down, left,
right. Analog: move {x,y}, look {x,y}, scroll (-1..1). ActionState per simulation step:
isDown(a), justPressed(a), justReleased(a). Gamepad families: xbox, playstation, nintendo,
generic. InputDevice: gamepad, touch, keyboard. Bindings are remappable and saved in settings.
Touch UI elements must carry the attribute data-touch-ui and are hidden while device is gamepad.

## 6. Content (content/schema.ts)
Every item has id (kebab-case, unique per kind), label (documented | reconstructed |
composite), sources (array of known source IDs, non-empty for documented items) and Hebrew
locale keys instead of raw text. Kinds: Chapter, Mission, CodexEntry, ArchiveItem, Testimony,
QuizQuestion, Fact. validateContent() returns a list of problems; CI fails on any.

## 7. Missions (core/mission.ts)
MissionDefinition: id, chapterId, gameplayType, checkpoints, machine (FSM definition with a
"complete" final state and a "failed" state), objectives, botScript per checkpoint.
analyzeMachine() must report: all states reachable, complete reachable from every state,
no dead ends except complete.

## 8. Scenes (render/sceneManager.ts)
GameScene: { scene, camera, update(dt), resize(w, h), dispose() }. SceneManager.switchTo
disposes the previous scene (geometries, materials, textures).

## 9. Ownership map (for parallel agents from M2)
| Area | Owner agent | Paths |
|---|---|---|
| Core (loop, fsm, events, save core, flow, content schema) | lead | src/core, src/content/schema.ts |
| Graphics | Graphics | src/render |
| Menus incl. settings, pause and save screens | UI | src/ui/screens, src/ui (except touch, glyphs) |
| Controls | Controls | src/core/input (adapters), src/ui/touch |
| Save UX and backends | Save | src/core/save/backends, src/ui/save |
| Audio | Audio | src/audio |
| UI and locales | UI | src/ui (except settings, touch, save), src/locales |
| Cinematics | Cinematics | src/cinematics |
| World and art | World | src/world |
| Android and CI | Android | android, .github |
| Chapter N | Chapter builder | src/content/chNN, src/levels/chNN |

## 10. Settings (core/settings.ts)
Settings sections: graphics (mode auto|preset|custom, preset, custom GraphicsOptions, benchmarked,
debugOverlay), audio (master, music, sfx, narration, voice), accessibility (subtitleSize,
reducedMotion, contentIntensity), gameplay (difficulty), controls (bindings, vibration, touchSize,
touchOpacity, touchLayout). SettingsManager.update(section, patch) validates, saves immediately to
the "settings" slot and emits settings:changed { key: section }. Never write settings elsewhere.

## 11. Plugging a system in (all agents)
- Each system exports one function: installX(game: Game): () => void (returns a disposer).
  Game (src/game.ts) exposes bus, flow, input, save, loop, settings, i18n, renderer, scenes,
  onStep(fn), getState(), setState().
- The lead wires install calls in src/main.ts. Agents may add their own install call in
  src/main.ts inside the block marked "SYSTEM INSTALLS" (one line each); nothing else in
  src/main.ts or src/game.ts.
- Strings: each area has its own file src/locales/he/<area>.json with keys prefixed by the area
  (e.g. graphics.*, audio.*). Duplicate keys fail the tests.
- CSS: each area has its own stylesheet next to its code, imported by its install module.
  Global tokens live in src/style.css (lead-owned).
- Touch-only elements carry data-touch-ui. Every interactive element is reachable by the
  FocusManager (UI agent) and works with confirm/back actions.
- No allocations in per-frame code paths; dispose everything on uninstall.

## 12. M2 events and stubs
Events added for M2: subtitle:show / subtitle:clear (UI renders subtitles at the chosen size),
audio:cue, audio:mood (Audio), cutscene:started / cutscene:ended (Cinematics), haptics:pulse
(Controls). src/ui/glyphs.ts glyphFor(action, device, family) is a stub owned by Controls; the UI
uses only that signature.

## 13. Narration speech backend
The Narrator (src/audio/narration.ts) speaks through a SpeechBackend { kind, hasVoice,
checkVoice, speak, cancel }. src/platform/speech.ts sharedSpeechBackend() picks the native
Android plugin NetivimTts (android/.../NativeTtsPlugin.java, android.speech.tts, offline Hebrew
voices only) when Capacitor.isNativePlatform() and the plugin is registered, otherwise
speechSynthesis. Plugin: isAvailable() -> { available }, speak({ text, rate, volume, id }),
stop(); events start / done / error with { id }. Events of a stopped or replaced line are
ignored (id map in the backend, current-line token in the Narrator). The failsafe is armed on
start; ducking, the narration level and audio.voice apply to every backend.

## 13. Rendering contract additions (M2)
- GameScene optional fields read by the RenderPipeline: sun, sunDirection, shadowDistance, era, applyGraphics(options), onContextRestored().
- antialias "msaa" means MSAA 4x plus SMAA.
- getRenderPipeline(game.renderer).setDepthOfField(focus, aperture?, maxBlur?) and clearDepthOfField(); allocation-free; only active when the depthOfField setting is on. Cinematics registers it with setDepthOfFieldTarget.
- ui:toast { textKey, params } shows a short notice; graphics notices use it.

## 14. Screen layout, captions and touch look (v0.2.2)
- src/ui/layout.ts is the one owner of the in-game screen. Regions: system (top-left icons), objective
  (top-right), notice / hint / toast (top-centre lines), prompt + captions (bottom-centre), stick and
  actions (bottom corners, mirrored when left-handed). It writes --rg-<region>-x/y/w/h/r/b on :root;
  every overlay positions itself ONLY with those variables. Regions never intersect (unit-tested).
- Captions: one component (src/ui/subtitles.ts). subtitle:show { ..., label? } carries the content
  label of the line (testimony, composite character); the caption shows speaker + label chip + text and
  pages long text. Nothing else may draw a box in the captions region.
- Caption paging never drops text (src/ui/captions.ts pageDurations / planCaption). A timed line's
  pages share its durationMs by length, each at least MIN_PAGE_MS (1 s), summing to exactly
  durationMs. If pages x 1 s does not fit, every page gets 1 s and the caption emits
  subtitle:extend { textKey, durationMs: total } synchronously from its subtitle:show handler; the
  mission host then holds its say queue for that total before the next line. A persistent line
  (durationMs <= 0) shows each non-last page for a reading time (70 ms/char, at least 1 s) and keeps
  the last page until cleared. Cutscene timelines are fixed and ignore subtitle:extend.
- ui:interact-available { available } is emitted by the mission HUD; the touch interact button is
  dimmed when false.
- Look drag: InputManager.addLookDelta(dxPx, dyPx) accumulates CSS px; each step converts the sum to
  radians (lookDrag, see src/core/input/lookDrag.ts; no dt, so frame-rate independent). The touch look
  area (src/ui/touch) and a mouse drag on the canvas feed it, only during missions with no menu or sheet.
- Touch paths (BRIEF 7: fully playable by touch): regions also include toolbar (bottom centre, above
  the prompt) and panel (right column under the objective, level side panels such as the Tower
  planning panel). LevelContext.touchActions(items | null) emits ui:touch-actions; the touch layer
  shows those buttons (48 px, hidden on a controller) in the toolbar region. Every action a level
  reads needs a touch path: a touch button, a touchActions item, or an entry in the level's exported
  TOUCH_ALTERNATIVES map (tests/unit/touchPaths.test.ts enforces it).
- InputManager latches presses: a touch tap or key press released before the next step still reads
  as down / justPressed for exactly one update.
