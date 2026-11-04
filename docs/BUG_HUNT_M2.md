# Bug hunt M2 (post v0.2.1)

Scope: gameplay director, mission host, the five levels (archive-night, jaffa-letters, tower-stockade,
night-landing, the-vote), audio cues, cinematics wiring, save/restore. The in-game screen layout, HUD,
touch controls and captions were being redesigned by another agent at the same time, so nothing under
`src/ui/**`, `src/gameplay/ui/**`, `src/core/input/**` or `gameplay.css` was edited.

Method: unit tests (headless bot with snapshots, forced retries, random walking), Playwright/Chromium at
1170x540 with touch (driver scripts over the `__netivim*` hooks), code reading.

## Bugs found and fixed

| # | Bug | Repro | Root cause | Fix | Regression test |
|---|-----|-------|--------|-----|------|
| 1 | Prologue and Chapter 1 cutscenes never play when a chapter is started from the timeline (new game). | New game, play Archive at Night to the end: flow goes straight mission -> debrief. Only "Continue" showed the cutscene. | Chapter cutscenes were registered only in the "Previously on" recap path (`Director.showRecap`). `cine.play` returned false for an unregistered id and the director silently fell back to the debrief. | `Director.registerCutscenes()` runs for every chapter open (`beginChapter` and the recap). `CinematicsApi.has(id)` added for the hook. | `tests/e2e/bughunt.spec.ts` |
| 2 | Jaffa Letters softlock after a manual save during the final meal. | Reach Jerusalem, deliver the letter, sit with Eliyahu, pause + save, reload + Continue: nothing can be done, the mission never ends. | The closing timer (`later(..., finish)`) is not part of the snapshot, and sitting disables the only interactable. | `enterCheckpoint` re-arms `finish` when a restored save has `sat` set. | `tests/unit/bughunt.fuzz.test.ts` (restore at every 12th second) |
| 3 | Night Landing loses the group on restore. | Manual save mid-beach (`shore`), Continue: every survivor is back at the landing spot, the found child is hiding again, the bot/player ahead of the group must walk back. | `snapshotData` saved only the player, cargo and bundles; `enterState` reset the rescue model. | `RescueModel.snapshot()/restore()`, stored in the level save (`rescue`, optional so older saves still load). | `tests/unit/bughunt.fuzz.test.ts` |
| 4 | The Vote: a save during the radio broadcast restores a dead radio and replays it. | Tap the radio, pause + save during the broadcast, Continue: radio interactable is live again, `heard` timer gone. | The `finale` countdown was not saved. | Saved as `finale`; restored with the radio effect on. | `tests/unit/bughunt.fuzz.test.ts` |
| 5 | Level ambience keeps playing after leaving Archive at Night or Jaffa Letters. | Exit the mission to the hub: the room/sea bed continues over the menu. | Their scene dispose never emitted `ambience.none` (Tower, Vote and Landing did). | Both emit `ambience.none` on dispose. | `tests/unit/bughunt.audio.test.ts`, `tests/e2e/bughunt.spec.ts` |
| 6 | Third-person camera passes through walls. | Walk with a wall behind the player (Archive, Tower): camera ends up on the other side or inside thin walls. | `safeDistance` sampled the ray in 16 steps starting at the minimum distance: a 0.4 m wall fell between samples, and a wall nearer than the minimum distance was never tested. | Exact ray vs box/circle entry distance per collider (terrain still marched). | `tests/unit/bughunt.camera.test.ts`, `tests/unit/bughunt.walk.test.ts` |
| 7 | Petah Tikva codex entry lost on retry/restore. | Deliver to Debora, fail or save before the tip line, retry. | Unlock lived inside a delayed timer that checkpoint entry clears. | Unlocked immediately; only the subtitle is delayed. | covered by fuzz (no unlock lost) and review |

Also added: `runBot` options `snapshot`, `onStep`, `startQueueIndex` (restore a save and resume the bot script), used by the fuzz tests.

## Reported for the UI agent (not edited)

None blocking found inside the touched areas. Observations only:
- Followers (Night Landing survivors, Jaffa/tower NPCs) do not collide with scenery; they can walk through dunes. Cosmetic, gameplay owner.
- `CameraRig` vehicle mode (boat) has no collider check; the sea has no walls today.
- Quick taps shorter than one simulation step could be missed by touch buttons if `input.update()` samples only once per step; not reproduced in Chromium, belongs to `src/core/input`.

## Checked and found clean

- Full chapter runs in the browser at 1170x540 touch: Prologue (Story/Normal) and Chapter 1 (Challenge): briefing, content note, every checkpoint, debrief, quiz, hub; no console warnings or errors, saves and unlocks correct.
- Pause on a failure card, resume, retry; abandon to hub (pause cleared, resume points at mission start); Continue after reload with a manual save; backgrounding (visibilitychange) while paused; difficulty switched Story/Challenge/Normal mid-mission.
- Retries and scene switches: 25 retries per level keep object, geometry and material counts flat; dispose unsubscribes every bus listener (unit); WebGL `renderer.info` stayed flat over 15 retries in Tower, Archive and Jaffa.
- Forced retry at four moments in every level on all difficulties completes; manual-save restore at several moments completes (Normal).
- Player spawn is outside every collider at every checkpoint; 6000 random steps with sweeping camera per level: never inside a wall, out of bounds, or non-finite.
- Every audio cue emitted by a full bot run exists in the audio library.

## Not verified

- Real-device touch and 120 Hz behavior (software GL only).
- Night Landing sea checkpoints use a boat view, so the walking-collision fuzz does not cover them.
- Memory over repeated scene switches for Night Landing and The Vote in the browser (covered by the unit scene-graph census only).
- Per-frame allocations were reviewed by reading hot paths only, not profiled.
