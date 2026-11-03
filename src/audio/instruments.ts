import type { LeadInstrument, PadInstrument } from './theory';

const SILENCE = 0.0001;

function env(ctx: BaseAudioContext, dest: AudioNode, t: number, attack: number, peak: number, end: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENCE, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(SILENCE, end);
  g.connect(dest);
  return g;
}

function osc(ctx: BaseAudioContext, type: OscillatorType, freq: number, detune: number, t: number, end: number): OscillatorNode {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

function lowpass(ctx: BaseAudioContext, freq: number, q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

/** Plucked oud-like note: bright saw that closes quickly, with a doubled course. */
function oud(ctx: BaseAudioContext, dest: AudioNode, f: number, t: number, dur: number, vel: number): void {
  const end = t + Math.max(0.9, dur * 1.4);
  const g = env(ctx, dest, t, 0.004, vel * 0.5, end);
  const lp = lowpass(ctx, 3200, 0.9);
  lp.frequency.setValueAtTime(3200, t);
  lp.frequency.exponentialRampToValueAtTime(550, t + 0.35);
  lp.connect(g);
  osc(ctx, 'sawtooth', f, -4, t, end).connect(lp);
  osc(ctx, 'triangle', f * 2, 4, t, end).connect(lp);
}

/** Soft piano-ish note from a few decaying partials. */
function piano(ctx: BaseAudioContext, dest: AudioNode, f: number, t: number, dur: number, vel: number): void {
  const end = t + Math.max(1.2, dur * 1.8);
  const g = env(ctx, dest, t, 0.006, vel * 0.45, end);
  const lp = lowpass(ctx, 2600, 0.5);
  lp.connect(g);
  osc(ctx, 'sine', f, 0, t, end).connect(lp);
  const h2 = ctx.createGain();
  h2.gain.value = 0.35;
  h2.connect(lp);
  osc(ctx, 'triangle', f * 2, 2, t, end).connect(h2);
  const h3 = ctx.createGain();
  h3.gain.value = 0.12;
  h3.connect(lp);
  osc(ctx, 'sine', f * 3, 0, t, end).connect(h3);
}

/** Reedy accordion note with gentle tremolo. */
function accordion(ctx: BaseAudioContext, dest: AudioNode, f: number, t: number, dur: number, vel: number): void {
  const end = t + dur * 1.1 + 0.3;
  const g = env(ctx, dest, t, 0.07, vel * 0.3, end);
  const lp = lowpass(ctx, 1700, 0.8);
  lp.connect(g);
  osc(ctx, 'sawtooth', f, -7, t, end).connect(lp);
  osc(ctx, 'sawtooth', f, 7, t, end).connect(lp);
  osc(ctx, 'square', f * 2, 0, t, end).connect(lp);
  const trem = osc(ctx, 'sine', 5.5, 0, t, end);
  const depth = ctx.createGain();
  depth.gain.value = vel * 0.04;
  trem.connect(depth);
  depth.connect(g.gain);
}

export function playLead(kind: LeadInstrument, ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, dur: number, vel: number): void {
  if (kind === 'oud') oud(ctx, dest, freq, t, dur, vel);
  else if (kind === 'accordion') accordion(ctx, dest, freq, t, dur, vel);
  else piano(ctx, dest, freq, t, dur, vel);
}

/** One sustained pad note: slow attack, long release. */
export function playPad(kind: PadInstrument, ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, dur: number, vel: number): void {
  const end = t + dur + 1.5;
  const attack = kind === 'strings' ? 1.2 : kind === 'synth' ? 1.8 : 1.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENCE, t);
  g.gain.linearRampToValueAtTime(vel * 0.14, t + attack);
  g.gain.setValueAtTime(vel * 0.14, t + dur);
  g.gain.exponentialRampToValueAtTime(SILENCE, end);
  g.connect(dest);
  if (kind === 'strings') {
    const lp = lowpass(ctx, 1000, 0.4);
    lp.connect(g);
    for (const d of [-9, 0, 9]) osc(ctx, 'sawtooth', freq, d, t, end).connect(lp);
  } else if (kind === 'synth') {
    const lp = lowpass(ctx, 900, 0.6);
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.6);
    lp.connect(g);
    osc(ctx, 'triangle', freq, -5, t, end).connect(lp);
    osc(ctx, 'sawtooth', freq, 5, t, end).connect(lp);
  } else {
    const lp = lowpass(ctx, 500, 0.3);
    lp.connect(g);
    osc(ctx, 'sine', freq, 0, t, end).connect(lp);
    osc(ctx, 'sawtooth', freq, 3, t, end).connect(lp);
  }
}

/** Soft sine bass under the chord. */
export function playBass(ctx: BaseAudioContext, dest: AudioNode, freq: number, t: number, dur: number, vel: number): void {
  const end = t + dur + 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(SILENCE, t);
  g.gain.linearRampToValueAtTime(vel * 0.2, t + 0.15);
  g.gain.setValueAtTime(vel * 0.2, t + dur * 0.7);
  g.gain.exponentialRampToValueAtTime(SILENCE, end);
  g.connect(dest);
  osc(ctx, 'sine', freq, 0, t, end).connect(g);
}

/** Very soft low thump used to suggest tension without any harshness. */
export function playPulse(ctx: BaseAudioContext, dest: AudioNode, t: number, vel: number): void {
  const end = t + 0.5;
  const g = env(ctx, dest, t, 0.02, vel * 0.18, end);
  const o = osc(ctx, 'sine', 62, 0, t, end);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
  o.connect(g);
}
