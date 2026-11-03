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

/**
 * While paused, a pause press (Start) resumes from anywhere in the pause menu. Escape is bound to
 * back + pause: when the UI already handled it as back (popping a sub-screen), it must not also
 * resume. Resuming is UI-owned; the core only pauses.
 */
export function pausePressResumes(c: { readonly pressedPause: boolean; readonly pressedBack: boolean; readonly recentUiKey: boolean }): boolean {
  if (!c.pressedPause) return false;
  return !(c.pressedBack && c.recentUiKey);
}
