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
| Graphics and settings | Graphics | src/render, src/ui/settings |
| Controls | Controls | src/core/input (adapters), src/ui/touch |
| Save UX and backends | Save | src/core/save/backends, src/ui/save |
| Audio | Audio | src/audio |
| UI and locales | UI | src/ui (except settings, touch, save), src/locales |
| Cinematics | Cinematics | src/cinematics |
| World and art | World | src/world |
| Android and CI | Android | android, .github |
| Chapter N | Chapter builder | src/content/chNN, src/levels/chNN |
