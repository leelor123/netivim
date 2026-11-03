export type InputDevice = 'gamepad' | 'touch' | 'keyboard';
export type GamepadFamily = 'xbox' | 'playstation' | 'nintendo' | 'generic';

export const ACTIONS = [
  'confirm',
  'back',
  'pause',
  'interact',
  'alt',
  'map',
  'tabPrev',
  'tabNext',
  'up',
  'down',
  'left',
  'right',
] as const;
export type Action = (typeof ACTIONS)[number];

export interface Vec2 {
  x: number;
  y: number;
}
