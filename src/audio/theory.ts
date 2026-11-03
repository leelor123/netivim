import type { Rng } from './util';

export type MoodName = 'calm' | 'tense' | 'reflective' | 'hopeful';
export const MOOD_NAMES: readonly MoodName[] = ['calm', 'tense', 'reflective', 'hopeful'];

/**
 * Modes as semitone offsets from the root. Fractions are quarter-tone-ish maqam colours
 * (rast has a neutral third and seventh).
 */
export const MODES = {
  hijaz: [0, 1, 4, 5, 7, 8, 10],
  rast: [0, 2, 3.5, 5, 7, 9, 10.5],
  nahawand: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
} as const satisfies Record<string, readonly number[]>;
export type ModeName = keyof typeof MODES;

export type LeadInstrument = 'oud' | 'accordion' | 'piano';
export type PadInstrument = 'drone' | 'strings' | 'synth';

export interface EraProfile {
  readonly id: string;
  readonly lead: LeadInstrument;
  readonly pad: PadInstrument;
  /** Root note (MIDI) the era's music sits on. */
  readonly rootMidi: number;
  readonly modes: Readonly<Record<MoodName, ModeName>>;
}

export const ERA_PROFILES: readonly (EraProfile & { readonly untilYear: number })[] = [
  { id: 'ottoman', untilYear: 1917, lead: 'oud', pad: 'drone', rootMidi: 50, modes: { calm: 'rast', tense: 'hijaz', reflective: 'nahawand', hopeful: 'rast' } },
  { id: 'mandate', untilYear: 1947, lead: 'oud', pad: 'strings', rootMidi: 52, modes: { calm: 'nahawand', tense: 'hijaz', reflective: 'dorian', hopeful: 'rast' } },
  { id: 'founding', untilYear: 1966, lead: 'accordion', pad: 'strings', rootMidi: 50, modes: { calm: 'dorian', tense: 'hijaz', reflective: 'nahawand', hopeful: 'ionian' } },
  { id: 'modern', untilYear: 1989, lead: 'piano', pad: 'strings', rootMidi: 52, modes: { calm: 'dorian', tense: 'phrygian', reflective: 'aeolian', hopeful: 'ionian' } },
  { id: 'contemporary', untilYear: 9999, lead: 'piano', pad: 'synth', rootMidi: 53, modes: { calm: 'aeolian', tense: 'phrygian', reflective: 'dorian', hopeful: 'lydian' } },
];

/** Representative years for chapter numbers, used when audio:mood carries a chapter index. */
const CHAPTER_YEARS = [1900, 1900, 1948, 1956, 1967, 1973, 1979, 1982, 1993, 2002, 2012, 2024, 2025] as const;

/** audio:mood.era is a year (1800+) or a chapter number (0-12). */
export function eraToYear(era: number): number {
  if (!Number.isFinite(era)) return 2000;
  if (era >= 1800) return Math.min(2100, Math.floor(era));
  const idx = Math.max(0, Math.min(CHAPTER_YEARS.length - 1, Math.round(era)));
  return CHAPTER_YEARS[idx] ?? 2000;
}

export function eraProfile(era: number): EraProfile {
  const year = eraToYear(era);
  const found = ERA_PROFILES.find((p) => year <= p.untilYear);
  return found ?? (ERA_PROFILES[ERA_PROFILES.length - 1] as EraProfile);
}

export interface MoodParams {
  readonly bpm: number;
  /** Chance a lead note plays on an eighth-note step. */
  readonly density: number;
  /** Octaves above the root register for the lead. */
  readonly leadOctave: number;
  readonly leadVel: number;
  readonly padVel: number;
  readonly bassVel: number;
  /** Soft low pulse for tension. */
  readonly pulse: boolean;
  /** Chord-root progressions (scale degrees), one chord per bar. */
  readonly progressions: readonly (readonly number[])[];
  /** Seconds a fade into this mood takes. */
  readonly fadeIn: number;
}

export const MOODS: Readonly<Record<MoodName, MoodParams>> = {
  calm: { bpm: 60, density: 0.38, leadOctave: 1, leadVel: 0.5, padVel: 0.5, bassVel: 0.5, pulse: false, progressions: [[0, 3, 4, 0], [0, 5, 3, 4]], fadeIn: 4 },
  tense: { bpm: 74, density: 0.2, leadOctave: 0, leadVel: 0.4, padVel: 0.42, bassVel: 0.6, pulse: true, progressions: [[0, 0, 1, 0], [0, 1, 0, 6]], fadeIn: 2.5 },
  reflective: { bpm: 50, density: 0.3, leadOctave: 2, leadVel: 0.45, padVel: 0.5, bassVel: 0.4, pulse: false, progressions: [[0, 5, 3, 6], [0, 2, 5, 4]], fadeIn: 5 },
  hopeful: { bpm: 68, density: 0.5, leadOctave: 1, leadVel: 0.55, padVel: 0.5, bassVel: 0.5, pulse: false, progressions: [[0, 4, 5, 3], [0, 3, 0, 4]], fadeIn: 4 },
};

/** Note (MIDI, may be fractional) for a scale degree; degrees wrap into other octaves. */
export function scaleNote(rootMidi: number, mode: readonly number[], degree: number): number {
  const n = mode.length;
  const octave = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return rootMidi + octave * 12 + (mode[idx] ?? 0);
}

/** Stable key identifying what a layer sounds like; equal keys never restart on re-request. */
export function layerKey(mood: MoodName, era: number): string {
  return eraProfile(era).id + ':' + mood;
}

export const REST = -99;
export const STEPS_PER_BAR = 8;

/**
 * Generates one bar of melody (eighth-note steps) as scale degrees, with REST for silence.
 * It walks stepwise with occasional leaps, favours chord tones on strong beats, and repeats
 * the previous bar's shape with small variations every few bars, so phrases feel intentional
 * but never loop mechanically. Pure and seeded.
 */
export class MelodyWalker {
  private degree = 4;
  private bar = 0;
  private readonly last = new Int16Array(STEPS_PER_BAR).fill(REST);
  private readonly cur = new Int16Array(STEPS_PER_BAR).fill(REST);

  constructor(
    private readonly rng: Rng,
    private readonly fixedBars: readonly (readonly number[])[] | null = null,
  ) {}

  /** Fills `out` (length STEPS_PER_BAR) with the next bar. */
  nextBar(chordRoot: number, density: number, out: Int16Array): void {
    const barIndex = this.bar++;
    const fb = this.fixedBars;
    const fixed = fb ? fb[barIndex % fb.length] : undefined;
    if (fb && fixed) {
      // Fixed phrases repeat, with a seeded nudge on later passes so the theme breathes.
      const pass = Math.floor(barIndex / fb.length);
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        let d = fixed[i] ?? REST;
        if (d !== REST && pass > 0 && this.rng.chance(0.2)) d += this.rng.chance(0.5) ? 1 : -1;
        this.cur[i] = d;
      }
    } else if (barIndex % 4 === 3 && this.last[0] !== undefined && this.hasNotes(this.last)) {
      // Answer phrase: last bar again, transposed a step, with each note kept 75% of the time.
      const shift = this.rng.pick([-1, 1, 2]);
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        const prev = this.last[i] ?? REST;
        this.cur[i] = prev === REST || !this.rng.chance(0.75) ? REST : prev + shift;
      }
    } else {
      for (let i = 0; i < STEPS_PER_BAR; i++) {
        const strong = i === 0 ? 1.6 : i === 4 ? 1.3 : i % 2 === 0 ? 1 : 0.55;
        if (!this.rng.chance(density * strong)) {
          this.cur[i] = REST;
          continue;
        }
        if (i === 0 && this.rng.chance(0.6)) {
          // Land on a chord tone (root, third or fifth of the chord) near the current register.
          const tones = [chordRoot, chordRoot + 2, chordRoot + 4];
          let best = tones[0] ?? 0;
          let bestDist = Infinity;
          for (const base of tones) {
            for (const oct of [-7, 0, 7]) {
              const d = Math.abs(base + oct - this.degree);
              if (d < bestDist) {
                bestDist = d;
                best = base + oct;
              }
            }
          }
          this.degree = best;
        } else {
          const r = this.rng.next();
          const move = r < 0.28 ? 1 : r < 0.56 ? -1 : r < 0.68 ? 2 : r < 0.8 ? -2 : r < 0.86 ? 3 : r < 0.92 ? -3 : 0;
          this.degree += move;
        }
        // Stay in a comfortable range around the middle of the lead register.
        if (this.degree > 11) this.degree -= 4;
        if (this.degree < 0) this.degree += 4;
        this.cur[i] = this.degree;
      }
    }
    for (let i = 0; i < STEPS_PER_BAR; i++) {
      const v = this.cur[i] ?? REST;
      out[i] = v;
      this.last[i] = v;
    }
  }

  private hasNotes(bar: Int16Array): boolean {
    for (let i = 0; i < bar.length; i++) if ((bar[i] ?? REST) !== REST) return true;
    return false;
  }
}

/** The gentle title theme: four fixed phrases in D, varied on each pass. */
export const TITLE_PHRASES: readonly (readonly number[])[] = [
  [4, REST, 2, REST, 4, REST, 5, 4],
  [3, REST, REST, 2, 3, REST, 1, REST],
  [2, REST, 4, REST, 6, REST, 5, 4],
  [4, REST, REST, REST, 2, REST, REST, REST],
];
