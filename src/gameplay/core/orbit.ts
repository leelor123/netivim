import type { Collider } from './collision';
import type { HeightFn } from './movement';

/** Third-person orbit camera math (pure). Camera sits at target - forward * distance. */

export interface OrbitParams {
  /** Radians per second at full stick. */
  readonly yawSpeed: number;
  readonly pitchSpeed: number;
  readonly minPitch: number;
  readonly maxPitch: number;
  /** Preferred distance from the target (meters). */
  readonly distance: number;
  readonly minDistance: number;
  /** Clearance kept above the terrain and in front of obstacles. */
  readonly margin: number;
}

export const DEFAULT_ORBIT: OrbitParams = {
  yawSpeed: 2.4,
  pitchSpeed: 1.6,
  minPitch: -0.15,
  maxPitch: 1.1,
  distance: 6.5,
  minDistance: 1.2,
  margin: 0.4,
};

export interface OrbitState {
  yaw: number;
  pitch: number;
  /** Current (collision-safe, smoothed) distance. */
  distance: number;
}

/** Applies right-stick look. Stick right turns the view right; stick up looks up (lower pitch). */
export function applyLook(s: OrbitState, lookX: number, lookY: number, dt: number, p: OrbitParams = DEFAULT_ORBIT): void {
  s.yaw -= lookX * p.yawSpeed * dt;
  s.pitch = Math.min(p.maxPitch, Math.max(p.minPitch, s.pitch + lookY * p.pitchSpeed * dt));
}

/**
 * Longest distance (<= desired) at which the camera, seen from the target along the orbit
 * direction, does not go under the terrain or into a collider. Marches in fixed steps.
 */
export function safeDistance(
  tx: number,
  ty: number,
  tz: number,
  yaw: number,
  pitch: number,
  desired: number,
  heightAt: HeightFn,
  colliders: readonly Collider[],
  p: OrbitParams = DEFAULT_ORBIT,
): number {
  const cp = Math.cos(pitch);
  const dx = -Math.sin(yaw) * cp;
  const dz = -Math.cos(yaw) * cp;
  const dy = Math.sin(pitch);
  // Terrain: march (the ground is smooth, so a coarse step is enough).
  const steps = 16;
  let ok = desired;
  for (let i = 1; i <= steps; i++) {
    const d = p.minDistance + ((desired - p.minDistance) * i) / steps;
    if (ty + dy * d < heightAt(tx + dx * d, tz + dz * d) + p.margin) {
      ok = p.minDistance + ((desired - p.minDistance) * (i - 1)) / steps;
      break;
    }
  }
  // Colliders: exact entry distance of the ray into each footprint, so a thin wall can never fall
  // between two samples and a wall closer than minDistance still stops the camera.
  let wall = Infinity;
  for (const c of colliders) {
    const entry = rayEntry(tx, tz, dx, dz, desired, c);
    if (entry === null) continue;
    const top = heightAt(c.x, c.z) + (c.height ?? 3);
    // The ray rises with pitch > 0, so it is lowest where it enters (lowest at the far end when it descends).
    const yAt = ty + dy * (dy >= 0 ? entry.enter : Math.min(entry.exit, desired));
    if (yAt < top && entry.enter < wall) wall = entry.enter;
  }
  // Keep half a margin in front of whatever stopped the camera.
  let result = ok < desired ? Math.max(p.minDistance, ok - p.margin * 0.5) : ok;
  if (wall < Infinity) result = Math.min(result, Math.max(MIN_WALL_DISTANCE, wall - p.margin * 0.5));
  return result;
}

/** Closest the camera may come to the player when a wall is right behind them. */
const MIN_WALL_DISTANCE = 0.3;

/** Distances along the ray (xz = origin + dir * d, d in [0, max]) where it enters and leaves a footprint. */
function rayEntry(ox: number, oz: number, dx: number, dz: number, max: number, c: Collider): { enter: number; exit: number } | null {
  if (c.kind === 'circle') {
    const fx = ox - c.x;
    const fz = oz - c.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-12) return null;
    const b = 2 * (fx * dx + fz * dz);
    const cc = fx * fx + fz * fz - c.r * c.r;
    const disc = b * b - 4 * a * cc;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t0 = (-b - sq) / (2 * a);
    const t1 = (-b + sq) / (2 * a);
    if (t1 < 0 || t0 > max) return null;
    return { enter: Math.max(0, t0), exit: t1 };
  }
  let t0 = 0;
  let t1 = max;
  const axes: readonly (readonly [number, number, number, number])[] = [
    [ox, dx, c.x - c.hw, c.x + c.hw],
    [oz, dz, c.z - c.hd, c.z + c.hd],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) {
      const t = ta;
      ta = tb;
      tb = t;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return { enter: t0, exit: t1 };
}

/**
 * Smooths the distance: pulls in instantly (never clips), eases back out slowly.
 * Reduced motion eases out faster so the view does not drift for long.
 */
export function smoothDistance(current: number, safe: number, dt: number, reducedMotion: boolean): number {
  if (safe < current) return safe;
  const rate = reducedMotion ? 12 : 3;
  return current + (safe - current) * Math.min(1, rate * dt);
}

/** Writes the camera position for an orbit state around a target. */
export function orbitPosition(tx: number, ty: number, tz: number, s: OrbitState, out: { x: number; y: number; z: number }): void {
  const cp = Math.cos(s.pitch);
  out.x = tx - Math.sin(s.yaw) * cp * s.distance;
  out.y = ty + Math.sin(s.pitch) * s.distance;
  out.z = tz - Math.cos(s.yaw) * cp * s.distance;
}
