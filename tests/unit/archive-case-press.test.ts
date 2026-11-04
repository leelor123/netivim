import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { GameLoop } from '../../src/core/loop';
import { InputManager } from '../../src/core/input/inputManager';
import type { GamepadLike } from '../../src/core/input/gamepad';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import archive, { type ArchiveLevel } from '../../src/levels/ch00/archive-night';
import { SPOTS, progressFor } from '../../src/levels/ch00/shared/layout';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';

/**
 * Regression for the CI-only archive failure (shelf tour, "flag never flips after 5 A presses").
 * The game path a real controller takes: mocked Gamepad -> InputManager -> GameLoop in 'frame'
 * mode (several sub-steps per slow frame) -> MissionHost -> archive level. A button held for
 * exactly ONE rendered frame must close the open case sheet and mark that case, at any frame rate.
 */

const A = 0;
const X = 2;

function rig(x: number, z: number) {
  const bus = new EventBus<GameEvents>();
  const pad: GamepadLike = {
    id: 'Xbox Wireless Controller (Vendor: 045e)',
    index: 0,
    connected: true,
    mapping: 'standard',
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0],
  } as unknown as GamepadLike;
  const input = new InputManager(bus, { getGamepads: () => [pad] });
  const host = new MissionHost({
    def: archive,
    bus,
    input,
    difficulty: () => 'normal',
    snapshot: { missionId: archive.missionId, state: 'shelf_tour', checkpoint: 'shelf_tour', data: null },
    headless: true,
    quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    hooks: { onFailed: () => undefined, onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
  });
  host.start();
  const level = host.level as ArchiveLevel;
  level.enterCheckpoint('shelf_tour', { x, z, progress: progressFor('shelf_tour', null) });
  // Same step body as src/game.ts: input first, then every step hook (the director's host.update).
  const loop = new GameLoop({
    mode: 'frame',
    step: (dt) => {
      input.update();
      host.update(dt);
    },
  });
  const setButton = (i: number, pressed: boolean): void => {
    const b = pad.buttons[i] as { pressed: boolean; value: number };
    b.pressed = pressed;
    b.value = pressed ? 1 : 0;
  };
  /** Held for exactly one rendered frame of `frameSeconds`, then released for a few frames. */
  const tap = (i: number, frameSeconds: number): void => {
    setButton(i, true);
    loop.advance(frameSeconds);
    setButton(i, false);
    for (let k = 0; k < 3; k++) loop.advance(frameSeconds);
  };
  for (let k = 0; k < 5; k++) loop.advance(1 / 60);
  return { host, level, tap };
}

describe('archive shelf tour: one press per card, any frame rate', () => {
  // 60 fps, CI software GL (~4-20 fps: 'frame' mode splits into up to 5 sub-steps) and a stall.
  for (const fps of [60, 20, 8, 4, 1]) {
    it('X opens case B and a single A closes it and marks it at ' + String(fps) + ' fps', () => {
      const { host, level, tap } = rig(SPOTS.caseB.x, SPOTS.caseB.z);
      tap(X, 1 / fps);
      expect(level.qa.modal).toBe('case');
      expect(level.qa.activeCase).toBe('caseB');
      tap(A, 1 / fps);
      expect(level.qa.modal).toBe('none');
      expect(level.qa.progress.caseB).toBe(true);
      host.dispose();
    });
  }

  it('the CI failure: standing where the slow walker coasted to (1.2 m past B) opens the nearer case C', () => {
    // Recorded on the throttled run: walkTo(-6.6, 8.2) ended at (-6.66, 9.41); B is 1.21 m away,
    // C 1.19 m. The game is right to open C, so a test must check WHICH case opened.
    const { host, level, tap } = rig(-6.66, 9.41);
    tap(X, 1 / 4);
    expect(level.qa.activeCase).toBe('caseC');
    tap(A, 1 / 4);
    expect(level.qa.progress.caseC).toBe(true);
    expect(level.qa.progress.caseB).toBe(false);
    host.dispose();
  });
});
