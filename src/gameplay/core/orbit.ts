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
 * direction, does not go under the terrain (marched) or into a collider (exact ray entry).
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
    if (!rayEntry(tx, tz, dx, dz, desired, c)) continue;
    const top = heightAt(c.x, c.z) + (c.height ?? 3);
    // The ray rises with pitch > 0, so it is lowest where it enters (lowest at the far end when it descends).
    const yAt = ty + dy * (dy >= 0 ? HIT.enter : Math.min(HIT.exit, desired));
    if (yAt < top && HIT.enter < wall) wall = HIT.enter;
  }
  // Keep half a margin in front of whatever stopped the camera.
  let result = ok < desired ? Math.max(p.minDistance, ok - p.margin * 0.5) : ok;
  if (wall < Infinity) result = Math.min(result, Math.max(MIN_WALL_DISTANCE, wall - p.margin * 0.5));
  return result;
}

/** Closest the camera may come to the player when a wall is right behind them. */
const MIN_WALL_DISTANCE = 0.3;

/** Scratch result of rayEntry (the camera runs every step: no allocation). */
const HIT = { enter: 0, exit: 0 };

/**
 * Distances along the ray (xz = origin + dir * d, d in [0, max]) where it enters and leaves a
 * footprint, written to HIT. Returns false when the ray misses it.
 */
function rayEntry(ox: number, oz: number, dx: number, dz: number, max: number, c: Collider): boolean {
  if (c.kind === 'circle') {
    const fx = ox - c.x;
    const fz = oz - c.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-12) return false;
    const b = 2 * (fx * dx + fz * dz);
    const disc = b * b - 4 * a * (fx * fx + fz * fz - c.r * c.r);
    if (disc < 0) return false;
    const sq = Math.sqrt(disc);
    const t0 = (-b - sq) / (2 * a);
    const t1 = (-b + sq) / (2 * a);
    if (t1 < 0 || t0 > max) return false;
    HIT.enter = Math.max(0, t0);
    HIT.exit = t1;
    return true;
  }
  let t0 = 0;
  let t1 = max;
  for (let axis = 0; axis < 2; axis++) {
    const o = axis === 0 ? ox : oz;
    const d = axis === 0 ? dx : dz;
    const lo = axis === 0 ? c.x - c.hw : c.z - c.hd;
    const hi = axis === 0 ? c.x + c.hw : c.z + c.hd;
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) {
      const t = ta;
      ta = tb;
      tb = t;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  HIT.enter = t0;
  HIT.exit = t1;
  return true;
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
