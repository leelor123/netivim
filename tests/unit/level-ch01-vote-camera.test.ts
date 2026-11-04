import { describe, expect, it } from 'vitest';
import { circle } from '../../src/gameplay/core/collision';
import { DEFAULT_ORBIT, safeDistance } from '../../src/gameplay/core/orbit';
import { CHECKPOINT_SPAWN, HALL, type VoteState } from '../../src/levels/ch01/vote/data';
import { buildVoteStage, NPCS } from '../../src/levels/ch01/vote/stage';
import { DEFAULT_WORLD_QUALITY } from '../../src/world/quality';

/**
 * The follow camera sits behind the player; a spawn whose line of sight is blocked puts the lens
 * inside a wall. Every checkpoint spawn must keep the camera at its full distance.
 */
describe('The Vote: camera line of sight at every spawn', () => {
  const stage = buildVoteStage({ ...DEFAULT_WORLD_QUALITY, shadows: false });
  const world = stage.world;
  const colliders = [...world.colliders, ...NPCS.map((n) => circle(n.x, n.z, 0.38, 1.8))];
  const pitch = 0.35;
  const headY = 1.5;

  it('in the hall the camera itself stays inside the room (not outside the door or a wall)', () => {
    for (const state of ['map', 'statements'] as const) {
      const sp = CHECKPOINT_SPAWN[state];
      const cp = Math.cos(pitch);
      const cx = sp.x - Math.sin(sp.heading) * cp * DEFAULT_ORBIT.distance;
      const cz = sp.z - Math.cos(sp.heading) * cp * DEFAULT_ORBIT.distance;
      expect(Math.abs(cx - HALL.cx), state).toBeLessThan(HALL.w / 2 - 0.5);
      expect(Math.abs(cz - HALL.cz), state).toBeLessThan(HALL.d / 2 - 0.5);
    }
  });

  for (const state of Object.keys(CHECKPOINT_SPAWN) as VoteState[]) {
    it('checkpoint ' + state + ' frames the room', () => {
      const sp = CHECKPOINT_SPAWN[state];
      const ty = world.heightAt(sp.x, sp.z) + headY;
      const d = safeDistance(sp.x, ty, sp.z, sp.heading, pitch, DEFAULT_ORBIT.distance, world.heightAt, colliders, DEFAULT_ORBIT);
      expect(d, 'camera pulled in to ' + d.toFixed(2) + ' m').toBeGreaterThanOrEqual(DEFAULT_ORBIT.distance - 0.01);
    });
  }
});
