import { BEDS, BED_PREFIX, CUES, type BedDef, type LoopDef, type LoopParts, type OneShotDef } from './cues';
import type { AudioEngine } from './engine';
import { shapeCue, SENSITIVE_CUES, type ContentIntensity } from './intensity';
import { Rng, clamp, rampTo } from './util';
import type { Source, SynthEnv } from './synth';
import type { VoiceHandle } from './voices';

interface ActiveLoop {
  readonly key: string;
  readonly out: GainNode;
  readonly parts: LoopParts;
  readonly def: LoopDef;
  readonly voice: VoiceHandle | null;
  level: number;
}

interface BedEvent {
  readonly cue: string;
  readonly minGap: number;
  readonly maxGap: number;
  readonly intensity: number;
  nextAt: number;
}

const LOOP_FADE_IN = 0.5;
const BED_FADE = 1.6;

/** Plays one-shot and sustained cues on the sfx / ambience buses, within the voice limit. */
export class SfxPlayer {
  private readonly loops = new Map<string, ActiveLoop>();
  private mode: ContentIntensity = 'standard';
  private bed: string | null = null;
  private bedEvents: BedEvent[] = [];
  private pendingBed: string | null = null;
  private readonly rng: Rng;
  /** Cue names that were requested but are not in the library (for diagnostics and tests). */
  readonly unknown = new Set<string>();

  constructor(private readonly engine: AudioEngine) {
    this.rng = new Rng(engine.seed ^ 0x5f3759df);
  }

  get contentIntensity(): ContentIntensity {
    return this.mode;
  }

  get currentBed(): string | null {
    return this.bed ?? this.pendingBed;
  }

  activeLoops(): string[] {
    return [...this.loops.keys()];
  }

  setContentIntensity(mode: ContentIntensity): void {
    this.mode = mode;
    if (mode === 'gentle') for (const name of SENSITIVE_CUES) this.engine.limiter.killByName(name);
  }

  /** Entry point for audio:cue. Returns whether something started or changed. */
  handleCue(cue: string, intensity?: number): boolean {
    if (cue.startsWith(BED_PREFIX)) return this.setBed(cue.slice(BED_PREFIX.length));
    const def = CUES[cue];
    if (!def) {
      this.unknown.add(cue);
      return false;
    }
    const level = clamp(intensity ?? 1, 0, 1);
    return def.kind === 'once' ? this.playOnce(cue, def, level) : this.setLoop(cue, cue, def, level);
  }

  /** Called every engine tick: drives the occasional events of the active bed. */
  tick(now: number): void {
    if (this.pendingBed) this.flushPending();
    if (!this.bed) return;
    for (const ev of this.bedEvents) {
      if (now < ev.nextAt) continue;
      ev.nextAt = now + this.rng.range(ev.minGap, ev.maxGap);
      this.handleCue(ev.cue, ev.intensity);
    }
  }

  /** Starts or crossfades the environment bed; 'none' (or an unknown name) clears it. */
  setBed(name: string): boolean {
    const ctx = this.engine.context;
    const def: BedDef | undefined = BEDS[name];
    if (!ctx || this.engine.state !== 'running') {
      // Remember it; it starts once the context runs.
      this.pendingBed = def ? name : null;
      return false;
    }
    this.pendingBed = null;
    if (this.bed === name) return false;
    for (const key of [...this.loops.keys()]) if (key.startsWith('bed:')) this.stopLoop(key, BED_FADE);
    this.bed = def ? name : null;
    this.bedEvents = [];
    if (!def) return true;
    for (const l of def.loops) {
      const cd = CUES[l.cue];
      if (cd?.kind === 'loop') this.setLoop('bed:' + l.cue, l.cue, cd, l.intensity);
    }
    for (const ev of def.events) {
      this.bedEvents.push({ ...ev, nextAt: ctx.currentTime + this.rng.range(1, ev.maxGap) });
    }
    return true;
  }

  /** Applies a bed requested before the context was running. */
  flushPending(): void {
    if (this.pendingBed) this.setBed(this.pendingBed);
  }

  stopAll(): void {
    for (const key of [...this.loops.keys()]) this.stopLoop(key, 0.2);
    this.bed = null;
    this.bedEvents = [];
    this.engine.limiter.clear();
  }

  private env(out: AudioNode, t: number, maxSeconds: number): SynthEnv | null {
    const ctx = this.engine.context;
    const noise = this.engine.noise;
    if (!ctx || !noise) return null;
    return { ctx, out, noise, rng: this.rng, t, maxSeconds, sources: [] };
  }

  private busFor(def: OneShotDef | LoopDef): AudioNode | null {
    const b = this.engine.buses;
    if (!b) return null;
    return def.bus === 'ambience' ? b.ambience : b.sfx;
  }

  private playOnce(cue: string, def: OneShotDef, intensity: number): boolean {
    const ctx = this.engine.context;
    const bus = this.busFor(def);
    if (!ctx || !bus || this.engine.state !== 'running' || intensity <= 0) return false;
    const shape = shapeCue(cue, intensity, this.mode);
    if (!shape.play) return false;
    const now = ctx.currentTime;
    const duration = Math.min(def.duration, shape.maxSeconds ?? Infinity);
    const out = ctx.createGain();
    out.gain.value = def.gain * intensity * shape.gain;
    let dest: AudioNode = out;
    let lp: BiquadFilterNode | null = null;
    if (shape.lowpassHz !== null) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = shape.lowpassHz;
      out.connect(lp);
      dest = lp;
    }
    const env = this.env(out, now + 0.005, duration);
    if (!env) return false;
    const kill = (): void => {
      rampTo(out.gain, 0, ctx.currentTime, 0.03);
      stopAll(env.sources, ctx.currentTime + 0.2);
    };
    const voice = this.engine.limiter.acquire(cue, now, now + duration + 0.1, def.priority, kill);
    if (!voice) return false;
    dest.connect(bus);
    def.build(env);
    const end = now + duration + 0.1;
    stopAll(env.sources, end);
    cleanupWhenDone(env.sources, [out, lp]);
    return true;
  }

  private setLoop(key: string, cue: string, def: LoopDef, intensity: number): boolean {
    const ctx = this.engine.context;
    const bus = this.busFor(def);
    if (!ctx || !bus || this.engine.state !== 'running') return false;
    const existing = this.loops.get(key);
    if (intensity <= 0) {
      if (existing) this.stopLoop(key, 0.6);
      return existing !== undefined;
    }
    const level = def.level(intensity);
    if (existing) {
      existing.level = level;
      rampTo(existing.out.gain, level, ctx.currentTime, 0.15);
      existing.parts.update?.(intensity, ctx.currentTime);
      return true;
    }
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;
    const env = this.env(out, now + 0.005, Infinity);
    if (!env) return false;
    const voice = this.engine.limiter.acquire(cue, now, Infinity, def.priority, () => this.stopLoop(key, 0.3));
    if (!voice) return false;
    out.connect(bus);
    const parts = def.build(env, intensity);
    rampTo(out.gain, level, now, LOOP_FADE_IN / 3);
    this.loops.set(key, { key, out, parts, def, voice, level });
    return true;
  }

  private stopLoop(key: string, fade: number): void {
    const loop = this.loops.get(key);
    const ctx = this.engine.context;
    if (!loop || !ctx) return;
    this.loops.delete(key);
    if (loop.voice) this.engine.limiter.release(loop.voice);
    const now = ctx.currentTime;
    rampTo(loop.out.gain, 0, now, fade / 3);
    stopAll(loop.parts.sources, now + fade + 0.2);
    cleanupWhenDone(loop.parts.sources, [loop.out]);
  }
}

function stopAll(sources: readonly Source[], when: number): void {
  for (const s of new Set(sources)) {
    try {
      s.stop(when);
    } catch {
      // Already stopped.
    }
  }
}

/** Disconnects helper nodes once the last source has ended, so the graph never accumulates. */
function cleanupWhenDone(sources: readonly Source[], nodes: readonly (AudioNode | null)[]): void {
  let remaining = new Set(sources).size;
  for (const s of new Set(sources)) {
    s.onended = () => {
      remaining--;
      if (remaining <= 0) {
        for (const n of nodes) n?.disconnect();
      }
    };
  }
}
