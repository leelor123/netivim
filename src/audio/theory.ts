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
  /** Soft hand-drum accompaniment on calm and hopeful music. */
  readonly perc: boolean;
  /** Plucked arpeggio shimmer (qanun-like) over the chords. */
  readonly arp: boolean;
}

export const ERA_PROFILES: readonly (EraProfile & { readonly untilYear: number })[] = [
  { id: 'ottoman', untilYear: 1917, lead: 'oud', pad: 'drone', rootMidi: 50, perc: true, arp: true, modes: { calm: 'rast', tense: 'hijaz', reflective: 'nahawand', hopeful: 'rast' } },
  { id: 'mandate', untilYear: 1940, lead: 'oud', pad: 'strings', rootMidi: 52, perc: true, arp: true, modes: { calm: 'nahawand', tense: 'hijaz', reflective: 'dorian', hopeful: 'rast' } },
  // 1941-1947: nights at sea, on the beach and in town; sparser, darker, no hand drum.
  { id: 'late-mandate', untilYear: 1947, lead: 'oud', pad: 'strings', rootMidi: 51, perc: false, arp: false, modes: { calm: 'nahawand', tense: 'hijaz', reflective: 'nahawand', hopeful: 'rast' } },
  { id: 'founding', untilYear: 1966, lead: 'accordion', pad: 'strings', rootMidi: 50, perc: false, arp: false, modes: { calm: 'dorian', tense: 'hijaz', reflective: 'nahawand', hopeful: 'ionian' } },
  { id: 'modern', untilYear: 1989, lead: 'piano', pad: 'strings', rootMidi: 52, perc: false, arp: false, modes: { calm: 'dorian', tense: 'phrygian', reflective: 'aeolian', hopeful: 'ionian' } },
  { id: 'contemporary', untilYear: 9999, lead: 'piano', pad: 'synth', rootMidi: 53, perc: false, arp: false, modes: { calm: 'aeolian', tense: 'phrygian', reflective: 'dorian', hopeful: 'lydian' } },
];

/** Representative years for chapter numbers, used when audio:mood carries a chapter index. */
const CHAPTER_YEARS = [1900, 1946, 1948, 1956, 1967, 1973, 1979, 1982, 1993, 2002, 2012, 2024, 2025] as const;

/** audio:mood.era is a year (1800+) or a chapter number (0-12). */
export function eraToYear(era: number): number {
  if (!Number.isFinite(era)) return 2000;
  if (era >= 1800) return Math.min(2100, Math.floor(era));
  const idx = Math.max(0, Math.min(CHAPTER_YEARS.length - 1, Math.round(era)));
  return CHAPTER_YEARS[idx] ?? 2000;
}

/**
 * Years of the missions that exist so far. A mission's own year wins over the coarse chapter
 * number a level may send, so the score always matches the story's time and place.
 */
const MISSION_YEARS: readonly (readonly [string, number])[] = [
  ['jaffa', 1895],
  ['tower', 1937],
  ['landing', 1946],
  ['vote', 1947],
];

/** The year a mission is set in, or null when unknown (or when it is a framing present-day scene). */
export function missionYear(missionId: string): number | null {
  const id = missionId.toLowerCase();
  for (const [needle, year] of MISSION_YEARS) if (id.includes(needle)) return year;
  return null;
}

/** An explicit year is kept; a chapter number defers to the running mission's year when known. */
export function resolveEra(requested: number, missionEra: number | null): number {
  if (Number.isFinite(requested) && requested >= 1800) return requested;
  return missionEra ?? requested;
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
export function layerKey(mood: MoodName, era: number, gentle = false): string {
  return eraProfile(era).id + ':' + mood + (gentle ? ':gentle' : '');
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

/** Per-bar context for the composer: where we are in the four-bar phrase and the long-form arc. */
export interface PhraseContext {
  /** 0..3 within the current four-bar phrase. */
  readonly barInPhrase: number;
  /** 0 is the main section, 1 the contrasting one. */
  readonly section: number;
  /** 0..1 slow dynamic arc; low values leave more room. */
  readonly energy: number;
}

const RHYTHM_CELLS: readonly (readonly number[])[] = [
  [0, 2, 3, 5],
  [0, 3, 4, 6],
  [0, 1, 4, 6],
  [0, 2, 4, 7],
  [0, 3, 5, 6],
];
const CONTOURS: readonly (readonly number[])[] = [
  [0, 1, 2, 1],
  [0, -1, 0, 1],
  [0, 2, 1, 3],
  [0, 1, 0, -1],
  [0, -1, -2, 0],
];

const LOW = -2;
const HIGH = 11;

/**
 * Motif-based melody. One short motif (a rhythmic cell plus a contour) is chosen per layer and then
 * developed over a four-bar phrase: statement, sequence, fragment with a free tail, cadence. The
 * contrasting section states it from another chord tone, inverted. Low energy sometimes leaves a
 * whole bar of silence, so the music breathes instead of looping. Pure and seeded.
 */
export class MotifComposer {
  private readonly cell: readonly number[];
  private readonly contour: readonly number[];
  private anchor = 4;
  private prevEnd = 4;

  constructor(private readonly rng: Rng) {
    this.cell = rng.pick(RHYTHM_CELLS);
    this.contour = rng.pick(CONTOURS);
  }

  /** The motif's step positions (for tests). */
  get steps(): readonly number[] {
    return this.cell;
  }

  nextBar(chordRoot: number, density: number, ctx: PhraseContext, out: Int16Array): void {
    out.fill(REST);
    const r = this.rng;
    const base = this.chordToneNear(chordRoot, ctx.section === 1 ? 6 : 4);
    this.anchor = base;
    const sign = ctx.section === 1 ? -1 : 1;
    const put = (step: number, degree: number): void => {
      const d = Math.max(LOW, Math.min(HIGH, degree));
      out[step] = d;
      this.prevEnd = d;
    };
    switch (ctx.barInPhrase) {
      case 0:
        for (let i = 0; i < this.cell.length; i++) put(this.cell[i] ?? 0, base + sign * (this.contour[i] ?? 0));
        break;
      case 1: {
        const shift = r.pick([1, -1, 2]);
        for (let i = 0; i < this.cell.length; i++) {
          if (i > 0 && !r.chance(0.85)) continue;
          put(this.cell[i] ?? 0, base + shift + sign * (this.contour[i] ?? 0));
        }
        break;
      }
      case 2: {
        if (ctx.energy < 0.55 && r.chance(0.4)) break; // a breathing bar
        put(this.cell[0] ?? 0, base + sign * (this.contour[0] ?? 0));
        put(this.cell[1] ?? 2, base + sign * (this.contour[1] ?? 0));
        let d = this.prevEnd;
        for (let i = 2; i < this.cell.length; i++) {
          d += r.pick([-1, 1, 1, -2]);
          put(this.cell[i] ?? 4, d);
        }
        break;
      }
      default:
        // Cadence: a step down to a chord tone that is held.
        put(0, base + 2);
        put(2, base + 1);
        put(4, chordRoot + (r.chance(0.5) ? 0 : 2) + (base > 6 ? 7 : 0));
        break;
    }
    // Sparse passing tones between the motif notes, never on top of them.
    const fill = density * 0.3 * (0.5 + 0.5 * ctx.energy);
    for (const s of [1, 3, 5, 7]) {
      if (out[s] !== REST || ctx.barInPhrase === 3) continue;
      const prev = out[s - 1] ?? REST;
      if (prev !== REST && r.chance(fill)) put(s, prev + r.pick([-1, 1]));
    }
  }

  private chordToneNear(chordRoot: number, target: number): number {
    let best = chordRoot;
    let bestDist = Infinity;
    for (const base of [chordRoot, chordRoot + 2, chordRoot + 4]) {
      for (const oct of [-7, 0, 7]) {
        const dist = Math.abs(base + oct - target) + Math.abs(base + oct - this.anchor) * 0.5;
        if (dist < bestDist) {
          bestDist = dist;
          best = base + oct;
        }
      }
    }
    return best;
  }
}
