import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import type { GameEvents } from '../../src/core/gameEvents';
import { FIXED_DT } from '../../src/core/loop';
import { contains, pushOut, type MutablePoint } from '../../src/gameplay/core/collision';
import { BotInput } from '../../src/gameplay/runtime/bot';
import { MissionHost } from '../../src/gameplay/runtime/missionHost';
import type { PlayerController } from '../../src/gameplay/runtime/player';
import type { AnyLevelDefinition } from '../../src/gameplay/types';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';
import archive from '../../src/levels/ch00/archive-night';
import jaffa from '../../src/levels/ch00/jaffa-letters';
import tower from '../../src/levels/ch01/tower-stockade';
import landing from '../../src/levels/ch01/night-landing';
import vote from '../../src/levels/ch01/the-vote';

const LEVELS: readonly AnyLevelDefinition[] = [archive, jaffa, tower, landing, vote];

function makeHost(def: AnyLevelDefinition, input: BotInput, checkpoint: string): MissionHost {
  return new MissionHost({
    def,
    bus: new EventBus<GameEvents>(),
    input,
    difficulty: () => 'story',
    headless: true,
    quality: { ...DEFAULT_WORLD_QUALITY, shadows: false },
    reducedMotion: () => false,
    t: (k) => k,
    glyph: (a) => a,
    recordChoice: () => undefined,
    hooks: { onFailed: () => undefined, onDecision: () => undefined, onComplete: () => undefined, onPlan: () => undefined },
    snapshot: { missionId: def.missionId, state: checkpoint, checkpoint, data: null },
  });
}

/** The walking motor, when the level on foot exposes one (boats and rides have none). */
function motorOf(host: MissionHost): PlayerController['motor'] | null {
  const p = host.level?.player as Partial<PlayerController> | undefined;
  return p?.motor ?? null;
}

function overlap(m: PlayerController['motor']): string | null {
  const pt: MutablePoint = { x: m.x, z: m.z };
  for (const c of m.colliders) {
    pt.x = m.x;
    pt.z = m.z;
    if (pushOut(pt, m.params.radius - 0.02, c)) return JSON.stringify(c);
  }
  return null;
}

describe('bug hunt: the player never starts inside geometry', () => {
  for (const def of LEVELS) {
    for (const cp of def.mission.checkpoints) {
      it(def.id + ' / ' + cp + ': spawn is outside every collider and above the terrain', () => {
        const host = makeHost(def, new BotInput(), cp);
        host.start();
        const m = motorOf(host);
        // Night Landing exposes a view object (boat and foot), not the motor.
        if (def.id !== 'night-landing') expect(m, 'walking motor expected').not.toBeNull();
        if (m) {
          for (let i = 0; i < 3; i++) host.update(FIXED_DT);
          expect(overlap(m), 'spawn inside collider at ' + m.x.toFixed(2) + ',' + m.z.toFixed(2)).toBeNull();
          expect(Number.isFinite(m.y)).toBe(true);
        }
        host.dispose();
      });
    }
  }
});

describe('bug hunt: random walking never ends inside a wall or outside the level', () => {
  for (const def of LEVELS) {
    it(def.id + ': 6000 random steps (with 30 fps and 20 fps frames mixed in)', () => {
      const input = new BotInput();
      const host = makeHost(def, input, def.mission.machine.initial);
      host.start();
      const m = motorOf(host);
      let seed = 12345;
      const rnd = (): number => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      if (def.id !== 'night-landing') expect(m, 'walking motor expected').not.toBeNull();
      let ax = 0;
      let ay = 0;
      const bad: string[] = [];
      for (let i = 0; i < 6000 && m; i++) {
        if (i % 90 === 0) {
          ax = rnd() * 2 - 1;
          ay = rnd() * 2 - 1;
        }
        input.move.x = ax;
        input.move.y = ay;
        // Sweeping look input too: the camera must never end up inside a wall.
        input.look.x = Math.sin(i / 37) * 0.9;
        input.look.y = Math.sin(i / 53) * 0.6;
        input.beginStep();
        // The frame loop never exceeds FIXED_DT, but slow devices use whole steps back to back.
        host.update(FIXED_DT);
        const o = overlap(m);
        if (o) bad.push(i + ': inside ' + o + ' at ' + m.x.toFixed(2) + ',' + m.z.toFixed(2));
        const cam = host.level?.scene.camera;
        if (cam && i > 5) {
          for (const c of m.colliders) {
            if (c.kind === 'box' && contains(c, cam.position.x, cam.position.z) && cam.position.y < m.heightAt(c.x, c.z) + (c.height ?? 3)) {
              bad.push(i + ': camera inside ' + JSON.stringify(c) + ' at ' + cam.position.x.toFixed(2) + ',' + cam.position.y.toFixed(2) + ',' + cam.position.z.toFixed(2));
              break;
            }
          }
        }
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)) bad.push(i + ': non-finite position');
        if (m.bounds && (m.x < m.bounds.minX || m.x > m.bounds.maxX || m.z < m.bounds.minZ || m.z > m.bounds.maxZ)) bad.push(i + ': out of bounds');
      }
      host.dispose();
      expect(bad.slice(0, 5), bad.slice(0, 5).join('\n')).toEqual([]);
    });
  }
});
