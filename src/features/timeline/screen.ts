import type { Action } from '../../core/input/types';

/** Actions a hosted screen reacts to (the host forwards justPressed actions). */
export type ScreenAction = Extract<Action, 'confirm' | 'back' | 'left' | 'right' | 'up' | 'down' | 'tabPrev' | 'tabNext' | 'alt'>;

/** Analog input for one frame, same conventions as InputManager (-1..1, y down). */
export interface AnalogInput {
  readonly moveX: number;
  readonly moveY: number;
  readonly lookX: number;
  readonly lookY: number;
  /** Triggers: right minus left. */
  readonly scroll: number;
}

export const NO_ANALOG: AnalogInput = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, scroll: 0 };

/**
 * A plain DOM screen. The host (UI agent's ScreenManager) calls mount once, forwards actions and
 * per-frame analog input, and calls unmount, which must free every listener, timer and GPU resource.
 */
export interface HostedScreen {
  mount(root: HTMLElement): void;
  unmount(): void;
  /** Returns true when the action was handled. */
  onAction(action: ScreenAction): boolean;
  /** Optional per-frame analog input (sticks, triggers). dt in seconds. */
  update?(dt: number, analog: AnalogInput): void;
}
