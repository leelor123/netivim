import { describe, expect, it } from 'vitest';
import { box, circle, Point2, pushOut, resolveCircle, segmentBlocked, segmentBlockedAny, type Collider } from '../../src/gameplay/core/collision';
import { safeDistance } from '../../src/gameplay/core/orbit';
import * as ref from './reference/collisionRef';
import * as refOrbit from './reference/orbitRef';

/**
 * The collision / camera hot paths were rewritten to allocate nothing per collider (typed-array
 * scratch, inline rejection, one object shape per kind). These reference copies are the code as
 * it was before (tests/unit/reference); every answer must stay bit-identical.
 */

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function world(seed: number): { now: Collider[]; old: ref.Collider[] } {
  const r = rng(seed);
  const now: Collider[] = [];
  const old: ref.Collider[] = [];
  for (let i = 0; i < 60; i++) {
    const x = Math.round((r() * 40 - 20) * (i % 3 === 0 ? 1 : 4)) / 4;
    const z = (r() * 40 - 20) * (i % 4 === 0 ? 1 : 1.0001);
    const h = i % 2 === 0 ? undefined : 0.5 + r() * 4;
    if (r() < 0.5) {
      const hw = 0.2 + r() * 3;
      const hd = 0.2 + r() * 3;
      now.push(box(x, z, hw, hd, h));
      old.push(ref.box(x, z, hw, hd, h));
    } else {
      const rad = 0.2 + r() * 2;
      now.push(circle(x, z, rad, h));
      old.push(ref.circle(x, z, rad, h));
    }
  }
  return { now, old };
}

const heightAt = (x: number, z: number): number => Math.sin(x * 0.3) * 0.8 + Math.cos(z * 0.2) * 0.5;

describe('collision hot path matches the original implementation', () => {
  it('resolveCircle and pushOut', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { now, old } = world(seed);
      const r = rng(seed * 7);
      const bounds = seed % 2 === 0 ? { minX: -18, maxX: 18, minZ: -18, maxZ: 18 } : null;
      for (let i = 0; i < 400; i++) {
        const x = r() * 44 - 22;
        const z = r() * 44 - 22;
        const radius = 0.2 + r() * 1.2;
        const a = new Point2(x, z);
        const b = { x, z };
        expect(resolveCircle(a, radius, now, bounds)).toBe(ref.resolveCircle(b, radius, old, bounds));
        expect(a.x).toBe(b.x);
        expect(a.z).toBe(b.z);
        const k = i % now.length;
        const c = { x, z };
        const d = { x, z };
        expect(pushOut(c, radius, now[k] as Collider)).toBe(ref.pushOut(d, radius, old[k] as ref.Collider));
        expect(c).toEqual(d);
      }
    }
  });

  it('centre exactly inside a box and on a circle centre', () => {
    const p = new Point2(2, 3);
    const q = { x: 2, z: 3 };
    expect(resolveCircle(p, 0.35, [box(2, 3, 1, 1)])).toBe(ref.resolveCircle(q, 0.35, [ref.box(2, 3, 1, 1)]));
    expect([p.x, p.z]).toEqual([q.x, q.z]);
    const p2 = new Point2(5, 5);
    const q2 = { x: 5, z: 5 };
    expect(resolveCircle(p2, 0.35, [circle(5, 5, 1)])).toBe(ref.resolveCircle(q2, 0.35, [ref.circle(5, 5, 1)]));
    expect([p2.x, p2.z]).toEqual([q2.x, q2.z]);
  });

  it('segmentBlocked and segmentBlockedAny', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { now, old } = world(seed);
      const r = rng(seed * 13);
      for (let i = 0; i < 300; i++) {
        const ax = r() * 44 - 22;
        const az = r() * 44 - 22;
        const bx = i % 10 === 0 ? ax : r() * 44 - 22;
        const bz = r() * 44 - 22;
        let any = false;
        for (let k = 0; k < now.length; k++) {
          const hit = ref.segmentBlocked(ax, az, bx, bz, old[k] as ref.Collider);
          expect(segmentBlocked(ax, az, bx, bz, now[k] as Collider)).toBe(hit);
          any ||= hit;
        }
        expect(segmentBlockedAny(ax, az, bx, bz, now)).toBe(any);
      }
    }
  });

  it('safeDistance (camera)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { now, old } = world(seed);
      const r = rng(seed * 31);
      for (let i = 0; i < 300; i++) {
        const tx = r() * 40 - 20;
        const tz = r() * 40 - 20;
        const ty = heightAt(tx, tz) + 1.6;
        const yaw = r() * Math.PI * 2;
        const pitch = r() * 1.25 - 0.15;
        const desired = 2 + r() * 8;
        expect(safeDistance(tx, ty, tz, yaw, pitch, desired, heightAt, now)).toBe(refOrbit.safeDistance(tx, ty, tz, yaw, pitch, desired, heightAt, old));
      }
      // Axis-aligned rays (zero direction component) too.
      for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        expect(safeDistance(0.5, 2, 0.5, yaw, 0.2, 6.5, heightAt, now)).toBe(refOrbit.safeDistance(0.5, 2, 0.5, yaw, 0.2, 6.5, heightAt, old));
      }
    }
  });

  it('colliders always carry a height (one object shape per kind)', () => {
    expect(Object.keys(box(1, 2, 3, 4))).toEqual(['kind', 'x', 'z', 'hw', 'hd', 'height']);
    expect(Object.keys(circle(1, 2, 3))).toEqual(['kind', 'x', 'z', 'r', 'height']);
    expect(box(0, 0, 1, 1).height).toBe(3);
  });
});
