import { describe, expect, it } from 'vitest';
import { box, circle, contains, pushOut } from '../../src/gameplay/core/collision';
import { safeDistance } from '../../src/gameplay/core/orbit';

const flat = (): number => 0;

describe('bug hunt: orbit camera never ends up behind a wall', () => {
  it('a thin wall between two march samples still stops the camera', () => {
    // Camera looks along +z, so it sits behind the player at -z. Wall 0.1 m thick at z = -3.
    const d = safeDistance(0, 1.5, 0, 0, 0.1, 6.5, flat, [box(0, -3, 4, 0.05, 4)]);
    expect(d).toBeLessThan(3);
  });

  it('a wall closer than the minimum camera distance pulls the camera in front of it', () => {
    const d = safeDistance(0, 1.5, 0, 0, 0.1, 6.5, flat, [box(0, -0.6, 4, 0.1, 4)]);
    expect(d).toBeLessThan(0.6);
  });

  it('a pillar (circle collider) behind the player stops the camera', () => {
    const d = safeDistance(0, 1.5, 0, 0, 0.1, 6.5, flat, [circle(0, -2.2, 0.15, 4)]);
    expect(d).toBeLessThan(2.2);
  });

  it('a low wall the camera can clear does not pull it in', () => {
    const d = safeDistance(0, 1.5, 0, 0, 0.9, 6.5, flat, [box(0, -4, 4, 0.1, 0.5)]);
    expect(d).toBeGreaterThan(5);
  });

  it('random rays: the returned distance never leaves the camera inside a collider footprint', () => {
    let seed = 7;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let n = 0; n < 400; n++) {
      const colliders = [box(rnd() * 6 - 3, rnd() * 6 - 3, 0.3 + rnd() * 2, 0.05 + rnd() * 0.4, 4), circle(rnd() * 6 - 3, rnd() * 6 - 3, 0.1 + rnd() * 0.5, 4)];
      const yaw = rnd() * Math.PI * 2;
      const pitch = -0.15 + rnd() * 1.2;
      // The player stands outside every collider.
      // ... at least a player radius away from them.
      if (colliders.some((c) => pushOut({ x: 0, z: 0 }, 0.4, c))) continue;
      const d = safeDistance(0, 1.5, 0, yaw, pitch, 6.5, flat, colliders);
      const cp = Math.cos(pitch);
      const x = -Math.sin(yaw) * cp * d;
      const z = -Math.cos(yaw) * cp * d;
      const y = 1.5 + Math.sin(pitch) * d;
      for (const c of colliders) expect(y < 4 && contains(c, x, z), 'camera inside ' + JSON.stringify(c) + ' d=' + d.toFixed(2)).toBe(false);
    }
  });
});
