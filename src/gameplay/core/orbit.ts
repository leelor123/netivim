import { contains, type Collider } from './collision';
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
 * Applies a touch / mouse look drag that was already converted to radians (input lookDrag; see
 * core/input/lookDrag.ts). A drag is a distance, not a rate: no dt here, so it is frame-rate
 * independent. Same signs as the stick: drag right turns the view right, drag up looks up.
 */
export function applyLookDrag(s: OrbitState, yawRad: number, pitchRad: number, p: OrbitParams = DEFAULT_ORBIT): void {
  s.yaw -= yawRad;
  s.pitch = Math.min(p.maxPitch, Math.max(p.minPitch, s.pitch + pitchRad));
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
  const steps = 16;
  let ok = p.minDistance;
  for (let i = 1; i <= steps; i++) {
    const d = p.minDistance + ((desired - p.minDistance) * i) / steps;
    const x = tx + dx * d;
    const y = ty + dy * d;
    const z = tz + dz * d;
    if (y < heightAt(x, z) + p.margin) break;
    let blocked = false;
    for (const c of colliders) {
      if (y < heightAt(c.x, c.z) + (c.height ?? 3) && contains(c, x, z)) {
        blocked = true;
        break;
      }
    }
    if (blocked) break;
    ok = d;
  }
  return Math.max(p.minDistance, ok - (ok > p.minDistance ? p.margin * 0.5 : 0));
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
