import type { MoodParams } from './theory';

/** Content Intensity (BRIEF mandatory system 11) applied to the harsher cues. */
export type ContentIntensity = 'gentle' | 'standard';

export interface CueShape {
  /** False means the cue is skipped entirely. */
  readonly play: boolean;
  /** Gain multiplier on top of the requested intensity. */
  readonly gain: number;
  /** Extra low-pass cutoff in Hz, or null for none. */
  readonly lowpassHz: number | null;
  /** Hard cap on playback length in seconds, or null. */
  readonly maxSeconds: number | null;
}

const UNCHANGED: CueShape = { play: true, gain: 1, lowpassHz: null, maxSeconds: null };

/** Cues that are softened (or skipped) in the Gentle setting. */
export const SENSITIVE_CUES: readonly string[] = ['siren.alert', 'distant.rumble'];

/**
 * Decides how a cue should sound for the chosen Content Intensity.
 * Gentle: the siren is much quieter, muffled and short; the rumble is deeper and quieter, and
 * is skipped when it was requested at high intensity. Everything else is untouched.
 */
export function shapeCue(cue: string, requestedIntensity: number, mode: ContentIntensity): CueShape {
  if (mode !== 'gentle') return UNCHANGED;
  if (cue === 'siren.alert') return { play: true, gain: 0.35, lowpassHz: 700, maxSeconds: 6 };
  if (cue === 'distant.rumble') {
    if (requestedIntensity > 0.75) return { play: false, gain: 0, lowpassHz: null, maxSeconds: null };
    return { play: true, gain: 0.4, lowpassHz: 90, maxSeconds: null };
  }
  return UNCHANGED;
}

/**
 * Gentle also softens the score: no low heartbeat pulse, quieter and slower tense music, a
 * little less drive everywhere. Standard returns the parameters untouched.
 */
export function shapeMood(params: MoodParams, mode: ContentIntensity): MoodParams {
  if (mode !== 'gentle') return params;
  return {
    ...params,
    pulse: false,
    bpm: Math.min(params.bpm, 64),
    leadVel: params.leadVel * 0.85,
    bassVel: params.bassVel * 0.8,
  };
}
