import type { Vec2 } from '../../core/input/types';

export type TouchLayout = 'right-handed' | 'left-handed';
export type Side = 'left' | 'right';

/** Base joystick radius in CSS px at touchSize 1. */
export const STICK_RADIUS = 64;
/** Fraction of the radius that is ignored (kills thumb jitter at rest). */
export const STICK_DEAD_ZONE = 0.15;

/** Right-handed play: stick under the left thumb, buttons under the right one. Left-handed mirrors it. */
export function stickSide(layout: TouchLayout): Side {
  return layout === 'right-handed' ? 'left' : 'right';
}

export function buttonSide(layout: TouchLayout): Side {
  return stickSide(layout) === 'left' ? 'right' : 'left';
}

/**
 * Turns a finger offset from the stick origin (screen px, y down) into a -1..1 vector:
 * the offset is clamped to the unit circle, then the dead zone is removed and the rest rescaled
 * so output grows smoothly from 0 at the edge of the zone to 1 at full deflection.
 * Same convention as the gamepad: x right, y down. Writes into `out` (no allocation).
 */
export function stickVector(dx: number, dy: number, radius: number, deadZone: number, out: Vec2): void {
  const len = Math.hypot(dx, dy) / radius;
  if (!(len > deadZone)) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const scaled = (Math.min(1, len) - deadZone) / (1 - deadZone);
  out.x = (dx / (len * radius)) * scaled;
  out.y = (dy / (len * radius)) * scaled;
}

/** Limits the knob offset to the ring radius; returns the clamped offset in `out`. */
export function clampToRing(dx: number, dy: number, radius: number, out: Vec2): void {
  const len = Math.hypot(dx, dy);
  if (len <= radius || len === 0) {
    out.x = dx;
    out.y = dy;
    return;
  }
  out.x = (dx / len) * radius;
  out.y = (dy / len) * radius;
}

/** True when an x coordinate lies on the half of the screen where the stick may start. */
export function inStickHalf(x: number, viewportWidth: number, layout: TouchLayout): boolean {
  return stickSide(layout) === 'left' ? x < viewportWidth / 2 : x >= viewportWidth / 2;
}
