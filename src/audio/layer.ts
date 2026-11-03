import { playBass, playLead, playPad, playPulse } from './instruments';
import {
  MODES,
  MOODS,
  MelodyWalker,
  REST,
  STEPS_PER_BAR,
  TITLE_PHRASES,
  eraProfile,
  scaleNote,
  type EraProfile,
  type MoodName,
  type MoodParams,
} from './theory';
import { Rng, hashString, midiToFreq, rampTo } from './util';
import type { MoodLayer } from './mood';

export interface LayerRequest {
  readonly key: string;
  readonly mood: MoodName;
  readonly era: number;
  readonly title: boolean;
}

/** How far ahead of the audio clock notes are scheduled, in seconds. */
export const LOOKAHEAD = 0.6;

/**
 * One continuously generated piece of the Era Score for a (era, mood) pair. All nodes feed a
 * layer gain so the mood controller can crossfade layers. Scheduling is lookahead-based and
 * reuses its buffers, so a tick allocates only the Web Audio nodes of notes that are due.
 */
export class ScoreLayer implements MoodLayer {
  readonly key: string;
  private readonly input: GainNode;
  private readonly output: GainNode;
  private readonly nodes: AudioNode[] = [];
  private readonly profile: EraProfile;
  private readonly params: MoodParams;
  private readonly mode: readonly number[];
  private readonly rng: Rng;
  private readonly walker: MelodyWalker;
  private readonly progression: readonly number[];
  private readonly stepLen: number;
  private readonly bar = new Int16Array(STEPS_PER_BAR);
  private nextStepTime: number;
  private step = 0;
  private barCount = 0;
  private scheduling = true;
  private chordRoot = 0;
  private disposed = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    req: LayerRequest,
    seed: number,
  ) {
    this.key = req.key;
    this.profile = req.title
      ? { id: 'title', lead: 'piano', pad: 'synth', rootMidi: 50, modes: { calm: 'ionian', tense: 'dorian', reflective: 'dorian', hopeful: 'ionian' } }
      : eraProfile(req.era);
    this.params = req.title ? { ...MOODS.hopeful, bpm: 56, density: 0.4, fadeIn: 3 } : MOODS[req.mood];
    this.mode = MODES[this.profile.modes[req.mood]];
    this.rng = new Rng(seed ^ hashString(req.key));
    this.walker = new MelodyWalker(this.rng, req.title ? TITLE_PHRASES : null);
    this.progression = req.title ? [0, 5, 3, 4] : this.rng.pick(this.params.progressions);
    this.stepLen = 60 / this.params.bpm / 2;
    this.nextStepTime = ctx.currentTime + 0.15;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    // A small filtered echo gives the score space without a convolver (cheap on phones).
    const send = ctx.createGain();
    send.gain.value = 0.22;
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = 60 / this.params.bpm * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    this.input.connect(this.output);
    this.input.connect(send);
    send.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(tone);
    tone.connect(this.output);
    this.output.connect(destination);
    this.nodes.push(this.input, this.output, send, delay, feedback, tone);
  }

  get fadeInSeconds(): number {
    return this.params.fadeIn;
  }

  fadeIn(now: number, seconds: number): void {
    rampTo(this.output.gain, 1, now, seconds / 3);
  }

  fadeOut(now: number, seconds: number): void {
    this.scheduling = false;
    rampTo(this.output.gain, 0, now, seconds / 3);
  }

  stopScheduling(): void {
    this.scheduling = false;
  }

  /** Schedules every eighth-note step that starts before `until` (audio-clock seconds). */
  schedule(until: number): void {
    if (!this.scheduling || this.disposed) return;
    // If the clock ran ahead (tab was suspended), skip forward instead of burst-playing.
    if (this.nextStepTime < this.ctx.currentTime - 0.5) this.nextStepTime = this.ctx.currentTime + 0.1;
    while (this.nextStepTime < until) {
      this.playStep(this.nextStepTime);
      this.nextStepTime += this.stepLen;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduling = false;
    for (const n of this.nodes) n.disconnect();
    this.nodes.length = 0;
  }

  private playStep(t: number): void {
    const p = this.params;
    const ctx = this.ctx;
    if (this.step === 0) {
      const chord = this.progression[this.barCount % this.progression.length] ?? 0;
      this.chordRoot = chord;
      this.walker.nextBar(chord, p.density, this.bar);
      const barLen = this.stepLen * STEPS_PER_BAR;
      const root = this.profile.rootMidi;
      // Chord: root, third, fifth, plus the octave on hopeful moods; the tense mood leaves out the
      // third so it hangs unresolved.
      const degrees = this.params.pulse ? [chord, chord + 4] : [chord, chord + 2, chord + 4];
      for (const d of degrees) playPad(this.profile.pad, ctx, this.input, midiToFreq(scaleNote(root, this.mode, d)), t, barLen, p.padVel);
      playBass(ctx, this.input, midiToFreq(scaleNote(root - 12, this.mode, chord)), t, barLen, p.bassVel);
    }
    if (p.pulse && (this.step === 0 || this.step === 5)) playPulse(ctx, this.input, t, p.bassVel);
    const d = this.bar[this.step] ?? REST;
    if (d !== REST) {
      const midi = scaleNote(this.profile.rootMidi + 12 * p.leadOctave, this.mode, d);
      // Humanise timing and velocity slightly.
      const jitter = this.rng.range(0, 0.012);
      const long = this.step % 4 === 0 ? 2.2 : 1.2;
      playLead(this.profile.lead, ctx, this.input, midiToFreq(midi), t + jitter, this.stepLen * long, p.leadVel * this.rng.range(0.8, 1));
    }
    if (++this.step >= STEPS_PER_BAR) {
      this.step = 0;
      this.barCount++;
    }
  }

  /** Test helper: the chord degree of the bar being played. */
  get currentChordRoot(): number {
    return this.chordRoot;
  }
}
