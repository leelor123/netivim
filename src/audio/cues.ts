import { burst, lfo, tone, type Source, type SynthEnv } from './synth';

export type BusName = 'sfx' | 'ambience';

export interface OneShotDef {
  readonly kind: 'once';
  readonly bus: BusName;
  /** Higher survives the voice limiter. */
  readonly priority: number;
  /** Peak level before the requested intensity is applied. */
  readonly gain: number;
  /** Longest length in seconds. */
  readonly duration: number;
  build(env: SynthEnv): void;
}

export interface LoopParts {
  /** Sources to stop when the loop ends. */
  readonly sources: readonly Source[];
  /** Re-targets the sound when the requested intensity changes (e.g. truck speed). */
  update?(intensity: number, now: number): void;
}

export interface LoopDef {
  readonly kind: 'loop';
  readonly bus: BusName;
  readonly priority: number;
  /** Output level for a requested intensity 0..1. */
  level(intensity: number): number;
  build(env: SynthEnv, intensity: number): LoopParts;
}

export type CueDef = OneShotDef | LoopDef;

const once = (def: Omit<OneShotDef, 'kind'>): OneShotDef => ({ kind: 'once', ...def });
const loop = (def: Omit<LoopDef, 'kind'>): LoopDef => ({ kind: 'loop', ...def });

function looping(env: SynthEnv, kind: 'pink' | 'brown' | 'white'): AudioBufferSourceNode {
  const src = env.noise.source(kind, true);
  src.start(env.t, env.rng.range(0, 1));
  env.sources.push(src);
  return src;
}

function filter(env: SynthEnv, type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
  const f = env.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

function gainNode(env: SynthEnv, value: number): GainNode {
  const g = env.ctx.createGain();
  g.gain.value = value;
  return g;
}

function osc(env: SynthEnv, type: OscillatorType, freq: number): OscillatorNode {
  const o = env.ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.start(env.t);
  env.sources.push(o);
  return o;
}

/** All cue definitions. Names are part of the event contract (audio:cue). */
export const CUES: Readonly<Record<string, CueDef>> = {
  // ---- UI ----
  'ui.move': once({
    bus: 'sfx', priority: 9, gain: 0.5, duration: 0.1,
    build: (e) => tone(e, { f0: 620, f1: 700, dur: 0.06, peak: 0.5, lowpass: 3000 }),
  }),
  'ui.confirm': once({
    bus: 'sfx', priority: 9, gain: 0.6, duration: 0.35,
    build: (e) => {
      tone(e, { type: 'triangle', f0: 523, dur: 0.16, peak: 0.5 });
      tone(e, { type: 'triangle', f0: 784, at: 0.08, dur: 0.24, peak: 0.5 });
    },
  }),
  'ui.back': once({
    bus: 'sfx', priority: 9, gain: 0.55, duration: 0.25,
    build: (e) => {
      tone(e, { type: 'triangle', f0: 440, dur: 0.12, peak: 0.5 });
      tone(e, { type: 'triangle', f0: 330, at: 0.07, dur: 0.16, peak: 0.45 });
    },
  }),
  'ui.toggle': once({
    bus: 'sfx', priority: 9, gain: 0.5, duration: 0.1,
    build: (e) => {
      tone(e, { type: 'square', f0: 1200, dur: 0.02, peak: 0.25, lowpass: 4000 });
      tone(e, { f0: 800, f1: 600, dur: 0.05, peak: 0.45 });
    },
  }),
  'ui.save': once({
    bus: 'sfx', priority: 9, gain: 0.5, duration: 1.1,
    build: (e) => {
      tone(e, { f0: 659, dur: 0.6, peak: 0.45 });
      tone(e, { f0: 880, at: 0.12, dur: 0.6, peak: 0.4 });
      tone(e, { f0: 1175, at: 0.24, dur: 0.8, peak: 0.35 });
    },
  }),
  'ui.error': once({
    bus: 'sfx', priority: 9, gain: 0.45, duration: 0.4,
    build: (e) => {
      tone(e, { type: 'sawtooth', f0: 220, dur: 0.14, peak: 0.4, lowpass: 700 });
      tone(e, { type: 'sawtooth', f0: 196, at: 0.16, dur: 0.18, peak: 0.4, lowpass: 700 });
    },
  }),

  // ---- one-shot world sounds ----
  'footsteps.sand': once({
    bus: 'sfx', priority: 3, gain: 0.35, duration: 0.3,
    build: (e) => burst(e, { kind: 'pink', filter: 'bandpass', f0: e.rng.range(1100, 1700), q: 0.6, dur: 0.16, attack: 0.02, peak: 1 }),
  }),
  'footsteps.stone': once({
    bus: 'sfx', priority: 3, gain: 0.4, duration: 0.3,
    build: (e) => {
      tone(e, { f0: e.rng.range(110, 140), f1: 55, dur: 0.1, peak: 0.8 });
      burst(e, { kind: 'white', filter: 'bandpass', f0: e.rng.range(2200, 3200), q: 1.2, dur: 0.05, peak: 0.5 });
    },
  }),
  birds: once({
    bus: 'ambience', priority: 2, gain: 0.18, duration: 2.5,
    build: (e) => {
      const n = 3 + e.rng.int(4);
      let at = 0;
      const base = e.rng.range(2400, 3400);
      for (let i = 0; i < n; i++) {
        const o = tone(e, { f0: base, f1: base * e.rng.range(1.2, 1.5), at, dur: e.rng.range(0.06, 0.12), peak: 0.8 });
        lfo(e, 38, 90, o.frequency);
        at += e.rng.range(0.1, 0.3);
      }
    },
  }),
  crickets: once({
    bus: 'ambience', priority: 2, gain: 0.1, duration: 4.5,
    build: (e) => {
      const o = osc(e, 'sine', 4300);
      const g = gainNode(e, 0);
      o.connect(g);
      g.connect(e.out);
      for (let group = 0; group < 6; group++) {
        const t0 = e.t + group * 0.7;
        for (let p = 0; p < 4; p++) {
          const on = t0 + p * 0.06;
          g.gain.setValueAtTime(0.0001, on);
          g.gain.linearRampToValueAtTime(1, on + 0.015);
          g.gain.linearRampToValueAtTime(0.0001, on + 0.045);
        }
      }
      o.stop(e.t + 4.3);
    },
  }),
  'siren.alert': once({
    bus: 'sfx', priority: 8, gain: 0.22, duration: 16,
    build: (e) => {
      // Civil-defense style wail: rising and falling, a few cycles, fading out at the end.
      const o = osc(e, 'sine', 420);
      const o2 = osc(e, 'triangle', 420);
      o2.detune.value = 8;
      const g = gainNode(e, 1);
      o.connect(g);
      o2.connect(g);
      g.connect(e.out);
      const total = Math.min(14, e.maxSeconds);
      const cycle = 6;
      let t = e.t;
      o.frequency.setValueAtTime(420, t);
      o2.frequency.setValueAtTime(420, t);
      while (t < e.t + total - 0.01) {
        const rise = Math.min(t + cycle / 2, e.t + total);
        const fall = Math.min(t + cycle, e.t + total);
        for (const x of [o, o2]) {
          x.frequency.linearRampToValueAtTime(800, rise);
          x.frequency.linearRampToValueAtTime(420, fall);
        }
        t += cycle;
      }
      g.gain.setValueAtTime(1, e.t + total - 1);
      g.gain.linearRampToValueAtTime(0.0001, e.t + total);
      o.stop(e.t + total + 0.05);
      o2.stop(e.t + total + 0.05);
    },
  }),
  'distant.rumble': once({
    bus: 'sfx', priority: 4, gain: 0.5, duration: 4,
    build: (e) => {
      burst(e, { kind: 'brown', filter: 'lowpass', f0: 140, f1: 70, q: 0.5, dur: 3.5, attack: 0.7, peak: 1 });
      tone(e, { f0: 48, f1: 30, dur: 3, attack: 0.8, peak: 0.5 });
    },
  }),
  'radio.static': once({
    bus: 'sfx', priority: 3, gain: 0.2, duration: 2.5,
    build: (e) => {
      const src = e.noise.source('white', true);
      const bp = filter(e, 'bandpass', 2200, 0.8);
      const g = gainNode(e, 0);
      src.connect(bp);
      bp.connect(g);
      g.connect(e.out);
      for (let t = 0; t < 2.4; t += 0.04) g.gain.setValueAtTime(e.rng.range(0.1, 1), e.t + t);
      g.gain.setValueAtTime(0.0001, e.t + 2.4);
      src.start(e.t, e.rng.range(0, 1));
      src.stop(e.t + 2.45);
      e.sources.push(src);
    },
  }),
  typewriter: once({
    bus: 'sfx', priority: 3, gain: 0.35, duration: 0.15,
    build: (e) => {
      burst(e, { kind: 'white', filter: 'bandpass', f0: e.rng.range(3000, 4200), q: 1.5, dur: 0.03, peak: 0.8 });
      tone(e, { type: 'square', f0: e.rng.range(150, 210), dur: 0.02, peak: 0.3, lowpass: 900 });
    },
  }),
  'paper.rustle': once({
    bus: 'sfx', priority: 3, gain: 0.3, duration: 0.7,
    build: (e) => {
      let at = 0;
      for (let i = 0; i < 6; i++) {
        burst(e, { kind: 'white', filter: 'bandpass', f0: e.rng.range(4500, 7500), q: 0.9, at, dur: e.rng.range(0.03, 0.07), peak: e.rng.range(0.3, 1) });
        at += e.rng.range(0.03, 0.09);
      }
    },
  }),
  'interception.whoosh': once({
    bus: 'sfx', priority: 6, gain: 0.35, duration: 1.4,
    build: (e) => {
      burst(e, { kind: 'pink', filter: 'bandpass', f0: 400, f1: 4000, q: 1.1, dur: 0.9, attack: 0.25, peak: 1 });
      tone(e, { f0: 300, f1: 900, dur: 0.8, attack: 0.2, peak: 0.25 });
      tone(e, { f0: 150, f1: 90, at: 0.95, dur: 0.3, peak: 0.4 });
    },
  }),

  // ---- sustained world sounds (intensity 0 stops them) ----
  wind: loop({
    bus: 'ambience', priority: 5, level: (i) => 0.5 * i,
    build: (e) => {
      const bp = filter(e, 'bandpass', 450, 0.7);
      const swell = gainNode(e, 0.75);
      looping(e, 'pink').connect(bp);
      bp.connect(swell);
      swell.connect(e.out);
      return { sources: [...e.sources, lfo(e, 0.11, 220, bp.frequency), lfo(e, 0.07, 0.25, swell.gain)] };
    },
  }),
  sea: loop({
    bus: 'ambience', priority: 5, level: (i) => 0.55 * i,
    build: (e) => {
      const lp = filter(e, 'lowpass', 900, 0.5);
      const swell = gainNode(e, 0.6);
      looping(e, 'brown').connect(lp);
      lp.connect(swell);
      const hp = filter(e, 'highpass', 3000, 0.5);
      const hiss = gainNode(e, 0.06);
      looping(e, 'pink').connect(hp);
      hp.connect(hiss);
      swell.connect(e.out);
      hiss.connect(e.out);
      return { sources: [...e.sources, lfo(e, 0.09, 0.4, swell.gain), lfo(e, 0.09, 0.05, hiss.gain)] };
    },
  }),
  'engine.truck': loop({
    bus: 'sfx', priority: 6, level: (i) => 0.1 + 0.14 * i,
    build: (e, intensity) => {
      const saw = osc(e, 'sawtooth', 40 + 80 * intensity);
      const sub = osc(e, 'square', 20 + 40 * intensity);
      const lp = filter(e, 'lowpass', 220 + 700 * intensity, 0.8);
      const chug = gainNode(e, 0.75);
      saw.connect(lp);
      sub.connect(lp);
      lp.connect(chug);
      chug.connect(e.out);
      const l = lfo(e, 11, 0.25, chug.gain);
      return {
        sources: [...e.sources, l],
        update: (i, now) => {
          saw.frequency.setTargetAtTime(40 + 80 * i, now, 0.15);
          sub.frequency.setTargetAtTime(20 + 40 * i, now, 0.15);
          lp.frequency.setTargetAtTime(220 + 700 * i, now, 0.15);
          l.frequency.setTargetAtTime(8 + 10 * i, now, 0.15);
        },
      };
    },
  }),
  'engine.ship': loop({
    bus: 'sfx', priority: 6, level: (i) => 0.3 * i,
    build: (e) => {
      const lp = filter(e, 'lowpass', 200, 0.7);
      const chug = gainNode(e, 0.8);
      osc(e, 'sine', 38).connect(lp);
      osc(e, 'sawtooth', 76).connect(lp);
      osc(e, 'sawtooth', 76.7).connect(lp);
      lp.connect(chug);
      chug.connect(e.out);
      const wlp = filter(e, 'lowpass', 350, 0.5);
      const water = gainNode(e, 0.3);
      looping(e, 'brown').connect(wlp);
      wlp.connect(water);
      water.connect(e.out);
      return { sources: [...e.sources, lfo(e, 2.4, 0.2, chug.gain)] };
    },
  }),
  'crowd.murmur': loop({
    bus: 'ambience', priority: 5, level: (i) => 0.3 * i,
    build: (e) => {
      const make = (freq: number, q: number, rate: number, base: number): void => {
        const bp = filter(e, 'bandpass', freq, q);
        const g = gainNode(e, base);
        looping(e, 'pink').connect(bp);
        bp.connect(g);
        g.connect(e.out);
        lfo(e, rate, base * 0.7, g.gain);
      };
      make(500, 1.2, 0.31, 0.5);
      make(1400, 1.5, 0.17, 0.4);
      return { sources: [...e.sources] };
    },
  }),
  'room.tone': loop({
    bus: 'ambience', priority: 4, level: (i) => 0.2 * i,
    build: (e) => {
      const lp = filter(e, 'lowpass', 220, 0.5);
      looping(e, 'brown').connect(lp);
      lp.connect(e.out);
      return { sources: [...e.sources] };
    },
  }),
};

/** Environment beds started with ambience.<name>; one bed plays at a time, crossfaded. */
export interface BedDef {
  readonly loops: readonly { readonly cue: string; readonly intensity: number }[];
  readonly events: readonly { readonly cue: string; readonly minGap: number; readonly maxGap: number; readonly intensity: number }[];
}

export const BEDS: Readonly<Record<string, BedDef>> = {
  desert: { loops: [{ cue: 'wind', intensity: 0.7 }], events: [] },
  sea: { loops: [{ cue: 'sea', intensity: 0.8 }, { cue: 'wind', intensity: 0.25 }], events: [{ cue: 'birds', minGap: 12, maxGap: 25, intensity: 0.5 }] },
  city: { loops: [{ cue: 'crowd.murmur', intensity: 0.9 }, { cue: 'wind', intensity: 0.12 }], events: [] },
  village: { loops: [{ cue: 'crowd.murmur', intensity: 0.4 }, { cue: 'wind', intensity: 0.25 }], events: [{ cue: 'birds', minGap: 8, maxGap: 18, intensity: 0.6 }] },
  interior: { loops: [{ cue: 'room.tone', intensity: 1 }], events: [] },
  night: { loops: [{ cue: 'wind', intensity: 0.2 }], events: [{ cue: 'crickets', minGap: 3, maxGap: 5, intensity: 0.6 }] },
};

export const BED_PREFIX = 'ambience.';
export const TITLE_CUE = 'music.title';

/** Every cue name the system answers to (used by tests and the locale file). */
export function allCueNames(): string[] {
  return [...Object.keys(CUES), ...Object.keys(BEDS).map((b) => BED_PREFIX + b), BED_PREFIX + 'none', TITLE_CUE];
}
