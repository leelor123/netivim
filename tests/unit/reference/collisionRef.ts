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

export const box = (x: number, z: number, hw: number, hd: number, height?: number): BoxCollider =>
  height === undefined ? { kind: 'box', x, z, hw, hd } : { kind: 'box', x, z, hw, hd, height };
export const circle = (x: number, z: number, r: number, height?: number): CircleCollider =>
  height === undefined ? { kind: 'circle', x, z, r } : { kind: 'circle', x, z, r, height };

/** Pushes one circle out of one collider. Returns true when they overlapped. */
export function pushOut(p: MutablePoint, radius: number, c: Collider): boolean {
  if (c.kind === 'circle') {
    const dx = p.x - c.x;
    const dz = p.z - c.z;
    const min = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-6) {
      p.x = c.x + min;
      return true;
    }
    p.x = c.x + (dx / d) * min;
    p.z = c.z + (dz / d) * min;
    return true;
  }
  const minX = c.x - c.hw;
  const maxX = c.x + c.hw;
  const minZ = c.z - c.hd;
  const maxZ = c.z + c.hd;
  const cx = p.x < minX ? minX : p.x > maxX ? maxX : p.x;
  const cz = p.z < minZ ? minZ : p.z > maxZ ? maxZ : p.z;
  const dx = p.x - cx;
  const dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 1e-12) {
    if (d2 >= radius * radius) return false;
    const d = Math.sqrt(d2);
    p.x = cx + (dx / d) * radius;
    p.z = cz + (dz / d) * radius;
    return true;
  }
  // Center inside the box: leave along the axis of least penetration.
  const left = p.x - minX;
  const right = maxX - p.x;
  const back = p.z - minZ;
  const front = maxZ - p.z;
  const m = Math.min(left, right, back, front);
  if (m === left) p.x = minX - radius;
  else if (m === right) p.x = maxX + radius;
  else if (m === back) p.z = minZ - radius;
  else p.z = maxZ + radius;
  return true;
}

/** Resolves a circle against every collider (a few passes for corners) and the level bounds. */
export function resolveCircle(p: MutablePoint, radius: number, colliders: readonly Collider[], bounds: Bounds | null = null, passes = 3): boolean {
  let hit = false;
  for (let pass = 0; pass < passes; pass++) {
    let any = false;
    for (const c of colliders) if (pushOut(p, radius, c)) any = true;
    if (!any) break;
    hit = true;
  }
  if (bounds) {
    const x = Math.min(bounds.maxX - radius, Math.max(bounds.minX + radius, p.x));
    const z = Math.min(bounds.maxZ - radius, Math.max(bounds.minZ + radius, p.z));
    if (x !== p.x || z !== p.z) hit = true;
    p.x = x;
    p.z = z;
  }
  return hit;
}

/** True when the point lies inside the collider footprint. */
export function contains(c: Collider, x: number, z: number): boolean {
  if (c.kind === 'circle') return (x - c.x) ** 2 + (z - c.z) ** 2 <= c.r * c.r;
  return Math.abs(x - c.x) <= c.hw && Math.abs(z - c.z) <= c.hd;
}

/** True when the segment a-b passes through the collider footprint (line of sight). */
export function segmentBlocked(ax: number, az: number, bx: number, bz: number, c: Collider): boolean {
  if (c.kind === 'circle') {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((c.x - ax) * dx + (c.z - az) * dz) / len2)) : 0;
    const px = ax + dx * t - c.x;
    const pz = az + dz * t - c.z;
    return px * px + pz * pz < c.r * c.r;
  }
  // Slab test against the box.
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const slab = (p: number, d: number, min: number, max: number): boolean => {
    if (Math.abs(d) < 1e-9) return p >= min && p <= max;
    let ta = (min - p) / d;
    let tb = (max - p) / d;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 <= t1;
  };
  return slab(ax, dx, c.x - c.hw, c.x + c.hw) && slab(az, dz, c.z - c.hd, c.z + c.hd);
}
