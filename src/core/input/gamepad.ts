import type { GamepadFamily } from './types';

/** The subset of the Gamepad API we read; tests and the Android bridge can provide it too. */
export interface GamepadLike {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[];
  readonly axes: readonly number[];
}

/** Standard-mapping button indices (W3C Gamepad "standard" layout). */
export const BTN = {
  south: 0,
  east: 1,
  west: 2,
  north: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  select: 8,
  start: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  home: 16,
} as const;

/** Picks the glyph family from the browser id string (vendor ids and product names). */
export function detectFamily(id: string): GamepadFamily {
  const s = id.toLowerCase();
  // Xbox first: its pads are also named Wireless Controller, like DualShock 4 on Android.
  if (/045e|xbox|xinput|microsoft/.test(s)) return 'xbox';
  if (/054c|dualsense|dualshock|playstation|wireless controller/.test(s)) return 'playstation';
  if (/057e|nintendo|pro controller|joy-con/.test(s)) return 'nintendo';
  return 'generic';
}

/** Radial dead zone with rescaling so movement starts smoothly at the edge of the zone. */
export function applyDeadZone(x: number, y: number, zone: number, out: { x: number; y: number }): void {
  const len = Math.hypot(x, y);
  if (len < zone || !Number.isFinite(len)) {
    out.x = 0;
    out.y = 0;
    return;
  }
  const scaled = Math.min(1, (len - zone) / (1 - zone));
  out.x = (x / len) * scaled;
  out.y = (y / len) * scaled;
}
