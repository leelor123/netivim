import { playBass, playDrum, playLead, playPad, playPluck, playPulse } from './instruments';
import { shapeMood } from './intensity';
import {
  MODES,
  MOODS,
  MelodyWalker,
  MotifComposer,
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
  /** Content Intensity "gentle": softer tense music, no heartbeat pulse. */
  readonly gentle?: boolean;
}

/** How far ahead of the audio clock notes are scheduled, in seconds. */
export const LOOKAHEAD = 0.6;

/** Peak level of one layer into the music bus; leaves headroom for pads, bass, lead and drum together. */
export const LAYER_LEVEL = 0.62;

/** Hand-drum patterns on the eight-step bar: D dum, T tak. */
const DRUM_PATTERNS: readonly string[] = ['DT.TD.T.', 'DD.TD.T.', 'D..DT.T.'];

/** Orders of the two four-bar sections within each 16-bar cycle. */
const SECTION_ORDERS: readonly (readonly number[])[] = [
  [0, 0, 1, 0],
  [0, 1, 0, 1],
  [0, 0, 1, 1],
];

/** Key shifts (semitones) a layer may take, so repeated visits do not sit on exactly the same pitch. */
const KEY_SHIFTS: readonly number[] = [0, 0, 2, -2, 3];

/**
 * One continuously generated piece of the Era Score for a (era, mood) pair. All nodes feed a
 * layer gain so the mood controller can crossfade layers. Scheduling is lookahead-based and
 * reuses its buffers, so a tick allocates only the Web Audio nodes of notes that are due.
 *
 * Musical form: a motif is developed over four-bar phrases; two sections (main and contrasting
 * progressions) alternate in a 16-bar cycle whose order is re-rolled each cycle; a slow energy
 * arc shapes loudness and brightness; low energy leaves breathing bars. A seeded key shift and
 * seeded motif make every layer instance different.
 */
export class ScoreLayer implements MoodLayer {
  readonly key: string;
  private readonly input: GainNode;
  private readonly output: GainNode;
  private readonly tone: BiquadFilterNode;
  private readonly nodes: AudioNode[] = [];
  private readonly profile: EraProfile;
  private readonly params: MoodParams;
  private readonly mode: readonly number[];
  private readonly rng: Rng;
  private readonly walker: MelodyWalker | null;
  private readonly composer: MotifComposer | null;
  private readonly progressions: readonly (readonly number[])[];
  private readonly drumPattern: string;
  private readonly rootMidi: number;
  private readonly energyPhase: number;
  private readonly isTitle: boolean;
  private readonly stepLen: number;
  private readonly bar = new Int16Array(STEPS_PER_BAR);
  private sectionOrder: readonly number[] = SECTION_ORDERS[0] ?? [0, 0, 1, 0];
  private nextStepTime: number;
  private step = 0;
  private barCount = 0;
  private scheduling = true;
  private sparse = false;
  private chordRoot = 0;
  private energy = 1;
  private disposed = false;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    req: LayerRequest,
    seed: number,
  ) {
    this.key = req.key;
    this.isTitle = req.title;
    this.profile = req.title
      ? { id: 'title', lead: 'piano', pad: 'synth', rootMidi: 50, perc: false, arp: false, modes: { calm: 'ionian', tense: 'dorian', reflective: 'dorian', hopeful: 'ionian' } }
      : eraProfile(req.era);
    const base: MoodParams = req.title ? { ...MOODS.hopeful, bpm: 56, density: 0.4, fadeIn: 3 } : MOODS[req.mood];
    this.params = shapeMood(base, req.gentle ? 'gentle' : 'standard');
    this.mode = MODES[this.profile.modes[req.mood]];
    this.rng = new Rng(seed ^ hashString(req.key));
    this.rootMidi = this.profile.rootMidi + (req.title ? 0 : this.rng.pick(KEY_SHIFTS));
    this.energyPhase = this.rng.range(0, Math.PI * 2);
    this.walker = req.title ? new MelodyWalker(this.rng, TITLE_PHRASES) : null;
    this.composer = req.title ? null : new MotifComposer(this.rng);
    this.progressions = req.title ? [[0, 5, 3, 4]] : this.pickProgressions();
    this.drumPattern = this.rng.pick(DRUM_PATTERNS);
    this.stepLen = 60 / this.params.bpm / 2;
    this.nextStepTime = ctx.currentTime + 0.15;

    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 0;
    // Two filtered echo taps (dotted and double beat) give the score space without a convolver,
    // which keeps it cheap on phones.
    const beat = 60 / this.params.bpm;
    const wet = req.mood === 'reflective' ? 0.28 : 0.2;
    const send = ctx.createGain();
    send.gain.value = wet;
    const delayA = ctx.createDelay(2.5);
    delayA.delayTime.value = beat * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const delayB = ctx.createDelay(2.5);
    delayB.delayTime.value = beat * 1.5;
    const tapB = ctx.createGain();
    tapB.gain.value = 0.55;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 2400;
    this.input.connect(this.output);
    this.input.connect(send);
    send.connect(delayA);
    delayA.connect(feedback);
    feedback.connect(delayA);
    delayA.connect(this.tone);
    delayA.connect(delayB);
    delayB.connect(tapB);
    tapB.connect(this.tone);
    this.tone.connect(this.output);
    this.output.connect(destination);
    this.nodes.push(this.input, this.output, send, delayA, feedback, delayB, tapB, this.tone);
  }

  private pickProgressions(): readonly (readonly number[])[] {
    const all = this.params.progressions;
    const a = this.rng.pick(all);
    const others = all.filter((p) => p !== a);
    const b = others.length > 0 ? this.rng.pick(others) : a;
    return [a, b];
  }

  get fadeInSeconds(): number {
    return this.params.fadeIn;
  }

  fadeIn(now: number, seconds: number): void {
    rampTo(this.output.gain, LAYER_LEVEL, now, seconds / 3);
  }

  fadeOut(now: number, seconds: number): void {
    this.scheduling = false;
    rampTo(this.output.gain, 0, now, seconds / 3);
  }

  stopScheduling(): void {
    this.scheduling = false;
  }

  /** Thins the music while someone speaks: fewer lead notes, no shimmer or hand drum. */
  setSparse(on: boolean): void {
    this.sparse = on;
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

  private chordForBar(): { chord: number; barInPhrase: number; section: number } {
    const barInPhrase = this.barCount % 4;
    const phraseIndex = Math.floor(this.barCount / 4);
    if (this.isTitle) {
      const prog = this.progressions[0] ?? [0];
      return { chord: prog[this.barCount % prog.length] ?? 0, barInPhrase, section: 0 };
    }
    if (phraseIndex % 4 === 0 && barInPhrase === 0) {
      this.sectionOrder = this.rng.pick(SECTION_ORDERS);
    }
    const section = this.sectionOrder[phraseIndex % 4] ?? 0;
    const prog = this.progressions[section] ?? this.progressions[0] ?? [0];
    return { chord: prog[barInPhrase % prog.length] ?? 0, barInPhrase, section };
  }

  private startBar(t: number): void {
    const p = this.params;
    const ctx = this.ctx;
    const { chord, barInPhrase, section } = this.chordForBar();
    this.chordRoot = chord;
    this.energy = this.isTitle ? 0.85 : 0.72 + 0.28 * Math.sin(this.barCount * 0.52 + this.energyPhase);
    const e = this.energy;
    const density = p.density * (this.sparse ? 0.45 : 1);
    if (this.walker) this.walker.nextBar(chord, density, this.bar);
    else this.composer?.nextBar(chord, density, { barInPhrase, section, energy: e }, this.bar);

    const barLen = this.stepLen * STEPS_PER_BAR;
    const root = this.rootMidi;
    const padVel = p.padVel * (0.7 + 0.3 * e);
    // Chord voicing varies from bar to bar; the tense mood leaves out the third so it hangs.
    let degrees: number[];
    if (p.pulse) degrees = [chord, chord + 4];
    else {
      const v = this.rng.int(3);
      degrees = v === 0 ? [chord, chord + 2, chord + 4] : v === 1 ? [chord, chord + 4, chord + 7] : [chord + 2, chord + 4, chord + 7];
    }
    for (const d of degrees) playPad(this.profile.pad, ctx, this.input, midiToFreq(scaleNote(root, this.mode, d)), t, barLen, padVel);
    // A long tonic drone under the era's drone-pad profiles, renewed every phrase.
    if (this.profile.pad === 'drone' && barInPhrase === 0) {
      playPad('drone', ctx, this.input, midiToFreq(scaleNote(root - 12, this.mode, 0)), t, barLen * 4, 0.45);
    }
    playBass(ctx, this.input, midiToFreq(scaleNote(root - 12, this.mode, chord)), t, barLen, p.bassVel);
    // Brightness follows the energy arc.
    this.tone.frequency.setTargetAtTime(1500 + 1900 * e, t, 0.6);
  }

  private playStep(t: number): void {
    const p = this.params;
    const ctx = this.ctx;
    if (this.step === 0) this.startBar(t);
    const e = this.energy;
    const chord = this.chordRoot;
    const root = this.rootMidi;
    const lively = !this.sparse && !this.isTitle;

    if (p.pulse && (this.step === 0 || this.step === 5)) playPulse(ctx, this.input, t, p.bassVel);
    // Bass walks to the fifth on the third beat for the calmer moods.
    if (!p.pulse && this.step === 4 && lively && this.rng.chance(0.5)) {
      playBass(ctx, this.input, midiToFreq(scaleNote(root - 12, this.mode, chord + 4)), t, this.stepLen * 4, p.bassVel * 0.6);
    }
    // Soft hand drum on calm and hopeful music in eras that have one; rests every fourth bar.
    if (lively && this.profile.perc && !p.pulse && e > 0.5 && this.barCount >= 2 && this.barCount % 4 !== 3) {
      const hit = this.drumPattern[this.step];
      if (hit === 'D') playDrum(ctx, this.input, t, 'dum', 0.45 * e);
      else if (hit === 'T' && this.mood !== 'calm') playDrum(ctx, this.input, t, 'tak', 0.4 * e);
    }
    // Plucked shimmer on the second and fourth beats.
    if (lively && this.profile.arp && !p.pulse && (this.step === 2 || this.step === 6) && this.rng.chance(0.55 * e)) {
      const d = this.step === 2 ? chord + 4 : chord + 7;
      playPluck(ctx, this.input, midiToFreq(scaleNote(root + 12, this.mode, d)), t + 0.02, 0.4 * e);
    }

    const d = this.bar[this.step] ?? REST;
    if (d !== REST) {
      const midi = scaleNote(root + 12 * p.leadOctave, this.mode, d);
      // Humanise timing and velocity slightly.
      const jitter = this.rng.range(0, 0.014);
      const long = this.step % 4 === 0 ? 2.2 : 1.2;
      const vel = p.leadVel * (0.6 + 0.4 * e) * this.rng.range(0.8, 1) * (this.sparse ? 0.75 : 1);
      // Now and then a quick neighbour-note ornament before an oud note.
      if (this.profile.lead === 'oud' && !this.isTitle && this.rng.chance(0.16)) {
        const grace = scaleNote(root + 12 * p.leadOctave, this.mode, d + 1);
        playLead('oud', ctx, this.input, midiToFreq(grace), t + jitter, this.stepLen * 0.4, vel * 0.5);
        playLead('oud', ctx, this.input, midiToFreq(midi), t + jitter + 0.07, this.stepLen * long, vel);
      } else {
        playLead(this.profile.lead, ctx, this.input, midiToFreq(midi), t + jitter, this.stepLen * long, vel);
      }
    }
    if (++this.step >= STEPS_PER_BAR) {
      this.step = 0;
      this.barCount++;
    }
  }

  private get mood(): MoodName {
    return this.key.includes(':hopeful') ? 'hopeful' : this.key.includes(':calm') ? 'calm' : this.key.includes(':tense') ? 'tense' : 'reflective';
  }

  /** Test helper: the chord degree of the bar being played. */
  get currentChordRoot(): number {
    return this.chordRoot;
  }

  /** Test helper: the slow energy value of the bar being played (0.44..1). */
  get currentEnergy(): number {
    return this.energy;
  }

  /** Test helper: how many bars have been played. */
  get barsPlayed(): number {
    return this.barCount;
  }
}
