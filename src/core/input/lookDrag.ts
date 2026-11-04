import type { Vec2 } from './types';

/**
 * Touch / mouse look: converting a finger or mouse drag into camera rotation.
 *
 * Conversion (frame-rate independent by construction):
 *   radians = CSS pixels dragged * LOOK_RAD_PER_PX * sensitivity
 *
 * Pointer moves are ACCUMULATED in pixels between simulation steps and the whole sum is turned
 * into radians on the next step, then reset. No dt is involved: the same physical drag rotates
 * the camera by the same angle at 30, 60 or 120 Hz, however the moves are split across steps.
 * (The gamepad stick is a rate and is multiplied by dt; a drag is a distance and must not be.)
 *
 * 0.0045 rad/px: a half-screen swipe on a landscape phone (about 585 CSS px) turns about 150
 * degrees; a short 40 px flick about 10 degrees.
 */
export const LOOK_RAD_PER_PX = 0.0045;

/** Allowed range of the look sensitivity multiplier (settings.controls.lookSensitivity). */
export const LOOK_SENSITIVITY_MIN = 0.4;
export const LOOK_SENSITIVITY_MAX = 2;

/** Writes the rotation (radians, x = yaw, y = pitch) for an accumulated drag into `out`. */
export function dragToLook(dxPx: number, dyPx: number, sensitivity: number, out: Vec2): void {
  const k = LOOK_RAD_PER_PX * Math.min(LOOK_SENSITIVITY_MAX, Math.max(LOOK_SENSITIVITY_MIN, sensitivity));
  out.x = dxPx * k;
  out.y = dyPx * k;
}
