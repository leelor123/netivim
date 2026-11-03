import type { NoiseBank, NoiseKind } from './noise';
import type { Rng } from './util';

export type Source = OscillatorNode | AudioBufferSourceNode;

/** Everything a cue builder needs. `out` is the voice gain that the limiter can fade. */
export interface SynthEnv {
  readonly ctx: AudioContext;
  readonly out: AudioNode;
  readonly noise: NoiseBank;
  readonly rng: Rng;
  /** Start time on the audio clock. */
  readonly t: number;
  /** Maximum length allowed for this cue (Content Intensity), or Infinity. */
  readonly maxSeconds: number;
  /** Every source created through these helpers, so they can be stopped together. */
  readonly sources: Source[];
}

const SILENCE = 0.0001;

export interface ToneOptions {
  type?: OscillatorType;
  f0: number;
  /** Optional end frequency (exponential glide). */
  f1?: number;
  /** Start offset in seconds from env.t. */
  at?: number;
  dur: number;
  attack?: number;
  peak: number;
  lowpass?: number;
}

/** A single enveloped oscillator note. */
export function tone(env: SynthEnv, o: ToneOptions): OscillatorNode {
  const { ctx } = env;
  const t = env.t + (o.at ?? 0);
  const attack = o.attack ?? 0.005;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENCE, t);
  g.gain.linearRampToValueAtTime(o.peak, t + attack);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + o.dur);
  let tail: AudioNode = osc;
  if (o.lowpass !== undefined) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = o.lowpass;
    tail.connect(lp);
    tail = lp;
  }
  tail.connect(g);
  g.connect(env.out);
  osc.start(t);
  osc.stop(t + o.dur + 0.05);
  env.sources.push(osc);
  return osc;
}

export interface BurstOptions {
  kind: NoiseKind;
  filter: BiquadFilterType;
  f0: number;
  f1?: number;
  q?: number;
  at?: number;
  dur: number;
  attack?: number;
  peak: number;
}

/** A filtered noise burst with an attack/decay envelope. */
export function burst(env: SynthEnv, o: BurstOptions): AudioBufferSourceNode {
  const { ctx } = env;
  const t = env.t + (o.at ?? 0);
  const attack = o.attack ?? 0.004;
  const src = env.noise.source(o.kind, true);
  const f = ctx.createBiquadFilter();
  f.type = o.filter;
  f.frequency.setValueAtTime(o.f0, t);
  if (o.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
  f.Q.value = o.q ?? 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENCE, t);
  g.gain.linearRampToValueAtTime(o.peak, t + attack);
  g.gain.exponentialRampToValueAtTime(SILENCE, t + o.dur);
  src.connect(f);
  f.connect(g);
  g.connect(env.out);
  src.start(t, env.rng.range(0, 1));
  src.stop(t + o.dur + 0.05);
  env.sources.push(src);
  return src;
}

/** Low-frequency oscillator driving an AudioParam: param += sin(2*pi*rate*t) * depth. */
export function lfo(env: SynthEnv, rate: number, depth: number, target: AudioParam): OscillatorNode {
  const osc = env.ctx.createOscillator();
  osc.frequency.value = rate;
  const g = env.ctx.createGain();
  g.gain.value = depth;
  osc.connect(g);
  g.connect(target);
  osc.start(env.t);
  env.sources.push(osc);
  return osc;
}
