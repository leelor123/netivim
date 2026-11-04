/**
 * Simple 2D (XZ plane) collision for characters: a circle pushed out of axis-aligned boxes and
 * circles. Pure and allocation-free so it runs in the fixed step and in headless bot runs.
 */

export interface BoxCollider {
  readonly kind: 'box';
  readonly x: number;
  readonly z: number;
  /** Half width (x) and half depth (z). */
  readonly hw: number;
  readonly hd: number;
  /** Height above the ground at its center (for camera occlusion). Default 3 m. */
  readonly height?: number;
}

export interface CircleCollider {
  readonly kind: 'circle';
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly height?: number;
}

export type Collider = BoxCollider | CircleCollider;

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface MutablePoint {
  x: number;
  z: number;
}

/** Default collider height (camera occlusion) when none is given. */
export const DEFAULT_COLLIDER_HEIGHT = 3;

/**
 * Scratch point for resolveCircle. A class (own hidden class, double fields from the start) so
 * V8 updates x/z in place: a plain `{ x, z }` literal shares its map with every other such literal
 * in the program and can end up with boxed fields that allocate on every write.
 */
export class Point2 implements MutablePoint {
  x = 0.5;
  z = 0.5;
  constructor(x = 0, z = 0) {
    this.x = x;
    this.z = z;
  }
}

// One object shape per collider kind (height always present, fields always doubles), so the hot
// loops below stay monomorphic and V8 never has to box a field. Do not build colliders by hand.
export const box = (x: number, z: number, hw: number, hd: number, height: number = DEFAULT_COLLIDER_HEIGHT): BoxCollider => ({ kind: 'box', x, z, hw, hd, height });
export const circle = (x: number, z: number, r: number, height: number = DEFAULT_COLLIDER_HEIGHT): CircleCollider => ({ kind: 'circle', x, z, r, height });

/**
 * Scratch state of the hot loops, in a Float64Array on purpose: storing a double into an object
 * field or passing it to a call V8 does not inline can allocate a HeapNumber each time (measured
 * at 5-16 KB per frame here); typed-array stores never allocate.
 * [0] x, [1] z, [2] radius of the circle being resolved; [3..6] segment a-b for segmentHits.
 */
const S = new Float64Array(7);
const PX = 0;
const PZ = 1;
const PR = 2;
const AX = 3;
const AZ = 4;
const BX = 5;
const BZ = 6;

/** Pushes one circle out of one collider. Returns true when they overlapped. */
export function pushOut(p: MutablePoint, radius: number, c: Collider): boolean {
  S[PX] = p.x;
  S[PZ] = p.z;
  S[PR] = radius;
  const hit = pushOutScratch(c);
  if (hit) {
    p.x = S[PX] as number;
    p.z = S[PZ] as number;
  }
  return hit;
}

/** pushOut on the scratch circle (S[PX], S[PZ], S[PR]). */
function pushOutScratch(c: Collider): boolean {
  const px = S[PX] as number;
  const pz = S[PZ] as number;
  const radius = S[PR] as number;
  if (c.kind === 'circle') {
    const dx = px - c.x;
    const dz = pz - c.z;
    const min = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      S[PX] = c.x + min;
      return true;
    }
    S[PX] = c.x + (dx / d) * min;
    S[PZ] = c.z + (dz / d) * min;
    return true;
  }
  const minX = c.x - c.hw;
  const maxX = c.x + c.hw;
  const minZ = c.z - c.hd;
  const maxZ = c.z + c.hd;
  // Clear of the box on one axis: no overlap. Same answer as the distance test below; it skips
  // the clamp for the many far-away boxes (cheaper, and no float merges for V8 to box).
  if (px + radius <= minX || px - radius >= maxX || pz + radius <= minZ || pz - radius >= maxZ) return false;
  const cx = px < minX ? minX : px > maxX ? maxX : px;
  const cz = pz < minZ ? minZ : pz > maxZ ? maxZ : pz;
  const dx = px - cx;
  const dz = pz - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1e-12) {
    if (d2 >= radius * radius) return false;
    const d = Math.sqrt(d2);
    S[PX] = cx + (dx / d) * radius;
    S[PZ] = cz + (dz / d) * radius;
    return true;
  }
  // Center inside the box: leave along the axis of least penetration.
  const left = px - minX;
  const right = maxX - px;
  const back = pz - minZ;
  const front = maxZ - pz;
  const m = Math.min(left, right, back, front);
  if (m === left) S[PX] = minX - radius;
  else if (m === right) S[PX] = maxX + radius;
  else if (m === back) S[PZ] = minZ - radius;
  else S[PZ] = maxZ + radius;
  return true;
}

/** Resolves a circle against every collider (a few passes for corners) and the level bounds. */
export function resolveCircle(p: MutablePoint, radius: number, colliders: readonly Collider[], bounds: Bounds | null = null, passes = 3): boolean {
  let hit = false;
  S[PX] = p.x;
  S[PZ] = p.z;
  S[PR] = radius;
  const n = colliders.length;
  for (let pass = 0; pass < passes; pass++) {
    let any = false;
    for (let i = 0; i < n; i++) {
      const c = colliders[i] as Collider;
      // Inline rejection of colliders clear of the circle's square (most of them): the call
      // below is only made for near ones. Same answer as pushOutScratch, which returns false
      // for these; kept inline because the per-collider call allocates in V8's mid tier.
      const px = S[PX] as number;
      const pz = S[PZ] as number;
      if (c.kind === 'circle') {
        const reach = radius + c.r;
        if (px - c.x >= reach || c.x - px >= reach || pz - c.z >= reach || c.z - pz >= reach) continue;
      } else if (px + radius <= c.x - c.hw || px - radius >= c.x + c.hw || pz + radius <= c.z - c.hd || pz - radius >= c.z + c.hd) continue;
      if (pushOutScratch(c)) any = true;
    }
    if (!any) break;
    hit = true;
  }
  let x = S[PX] as number;
  let z = S[PZ] as number;
  if (bounds) {
    const bx = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, x));
    const bz = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, z));
    if (bx !== x || bz !== z) hit = true;
    x = bx;
    z = bz;
  }
  // Untouched points keep their exact values (no store, no allocation).
  if (x !== p.x) p.x = x;
  if (z !== p.z) p.z = z;
  return hit;
}

/** True when the point lies inside the collider footprint. */
export function contains(c: Collider, x: number, z: number): boolean {
  if (c.kind === 'circle') return (x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r;
  return Math.abs(x - c.x) <= c.hw && Math.abs(z - c.z) <= c.hd;
}

/** True when the segment a-b passes through the collider footprint (line of sight). */
export function segmentBlocked(ax: number, az: number, bx: number, bz: number, c: Collider): boolean {
  S[AX] = ax;
  S[AZ] = az;
  S[BX] = bx;
  S[BZ] = bz;
  return segmentHits(c);
}

/** True when the segment a-b passes through any of the colliders (allocation-free). */
export function segmentBlockedAny(ax: number, az: number, bx: number, bz: number, colliders: readonly Collider[]): boolean {
  S[AX] = ax;
  S[AZ] = az;
  S[BX] = bx;
  S[BZ] = bz;
  for (let i = 0; i < colliders.length; i++) if (segmentHits(colliders[i] as Collider)) return true;
  return false;
}

function segmentHits(c: Collider): boolean {
  const ax = S[AX] as number;
  const az = S[AZ] as number;
  const dx = (S[BX] as number) - ax;
  const dz = (S[BZ] as number) - az;
  if (c.kind === 'circle') {
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((c.x - ax) * dx + (c.z - az) * dz) / len2)) : 0;
    const px = ax + dx * t - c.x;
    const pz = az + dz * t - c.z;
    return px * px + pz * pz < c.r * c.r;
  }
  // Slab test against the box (both axes inline: no closure per call).
  let t0 = 0;
  let t1 = 1;
  for (let axis = 0; axis < 2; axis++) {
    const p = axis === 0 ? ax : az;
    const d = axis === 0 ? dx : dz;
    const min = axis === 0 ? c.x - c.hw : c.z - c.hd;
    const max = axis === 0 ? c.x + c.hw : c.z + c.hd;
    if (Math.abs(d) < 1e-9) {
      if (p < min || p > max) return false;
      continue;
    }
    let ta = (min - p) / d;
    let tb = (max - p) / d;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
