/**
 * Single source of truth for reduced motion: the in-game accessibility setting OR the OS
 * "reduce motion" preference. Everything that animates (UI, cinematics, timeline, living map,
 * gameplay cameras) asks this one function.
 */

export interface MotionQuery {
  readonly matches: boolean;
}

export function isReducedMotion(settingOn: boolean, os: MotionQuery | null): boolean {
  return settingOn || (os?.matches ?? false);
}

/** Creates the shared getter. `os` is the live `(prefers-reduced-motion: reduce)` query, if any. */
export function createReducedMotion(readSetting: () => boolean, os: MotionQuery | null): () => boolean {
  return () => isReducedMotion(readSetting(), os);
}

/** The live OS query, or null where matchMedia is unavailable (tests, old WebViews). */
export function osMotionQuery(): MediaQueryList | null {
  return typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
}
