import type { FlowEvent, FlowState } from '../core/flow';

/** Pure UI decisions (no DOM), unit tested. */

export interface SliderSpec {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** One D-pad step on a slider: snaps to the step grid and clamps, free of float drift. */
export function stepSlider(value: number, delta: number, spec: SliderSpec): number {
  const { min, max, step } = spec;
  const index = Math.round((value - min) / step) + delta;
  const next = min + index * step;
  const clamped = Math.min(max, Math.max(min, next));
  return Math.round(clamped * 10000) / 10000;
}

/** Value under a pointer on a slider track; the track fills from the start edge (right in RTL). */
export function sliderFromPointer(x: number, left: number, width: number, rtl: boolean, spec: SliderSpec): number {
  if (width <= 0) return spec.min;
  let t = (x - left) / width;
  if (rtl) t = 1 - t;
  t = Math.min(1, Math.max(0, t));
  return stepSlider(spec.min + t * (spec.max - spec.min), 0, spec);
}

/** Fraction 0..1 of a value within a slider's range (for drawing the fill). */
export function sliderFraction(value: number, spec: SliderSpec): number {
  return spec.max === spec.min ? 0 : Math.min(1, Math.max(0, (value - spec.min) / (spec.max - spec.min)));
}

/** Cycles through a list of options (wraps both ways). */
export function cycleOption<T>(options: readonly T[], current: T, delta: number): T {
  const n = options.length;
  if (n === 0) return current;
  const i = options.indexOf(current);
  const base = i < 0 ? 0 : i;
  return options[(((base + delta) % n) + n) % n] as T;
}

export type ExitDecision = 'exit' | 'prompt';

/** BRIEF 8.E: exiting a mission or cutscene with unsaved progress asks first. */
export function decideExit(s: { readonly volatile: boolean; readonly dirty: boolean }): ExitDecision {
  return s.volatile && s.dirty ? 'prompt' : 'exit';
}

/** Flow events that lead from a state back to the title screen. */
export function exitPath(state: FlowState): readonly FlowEvent[] {
  switch (state) {
    case 'mission':
    case 'cutscene':
      return ['abandon', 'toTitle'];
    case 'briefing':
      return ['back', 'toTitle'];
    case 'debrief':
    case 'quiz':
      return ['toHub', 'toTitle'];
    case 'hub':
      return ['toTitle'];
    default:
      return [];
  }
}

/** States in which the pause menu can open (not on the boot or title screens). */
export function canPauseIn(state: FlowState): boolean {
  return state !== 'boot' && state !== 'title';
}

export interface ResumeContext {
  /** The UI itself asked to resume. */
  readonly uiInitiated: boolean;
  /** The pause menu is on screen. */
  readonly pauseOpen: boolean;
  /** Number of screens on the stack (1 = pause menu root). */
  readonly depth: number;
  readonly pressedPause: boolean;
  readonly pressedBack: boolean;
  readonly pressedConfirm: boolean;
  /** The focused item is the Resume button. */
  readonly resumeFocused: boolean;
  /** The UI handled a key press in the last moments (keyboard events arrive before the frame). */
  readonly recentUiKey: boolean;
}

/**
 * The game loop resumes on confirm/back while paused (src/game.ts). Inside the pause menu those
 * buttons belong to the UI, so such a resume is cancelled unless it is what the player meant.
 */
export function shouldVetoResume(c: ResumeContext): boolean {
  if (c.uiInitiated || !c.pauseOpen) return false;
  if (c.recentUiKey) return true;
  if (c.pressedBack) return c.depth > 1;
  if (c.pressedPause) return false;
  if (c.pressedConfirm) return !(c.depth === 1 && c.resumeFocused);
  return false;
}
