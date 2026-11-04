import type { Settings } from '../core/settings';
import { NoiseBank } from './noise';
import { VoiceLimiter } from './voices';
import { rampTo } from './util';

export type AudioSettings = Settings['audio'];

export interface Buses {
  readonly master: GainNode;
  readonly music: GainNode;
  /** Music layers connect here; it is dipped while narration speaks. */
  readonly musicDuck: GainNode;
  readonly sfx: GainNode;
  /** Ambience cues connect here. */
  readonly ambience: GainNode;
  /** Ambience sits behind this stage, which is dipped under narration and captions. */
  readonly ambienceDuck: GainNode;
  /** Final stage before the speakers; faded to silence around suspend/resume so there is no click. */
  readonly gate: GainNode;
  readonly narration: GainNode;
}

export interface EngineOptions {
  createContext?: () => AudioContext;
  /** Seeds every random choice in the audio system (variation, noise). */
  seed?: number;
  maxVoices?: number;
  /** Scheduler period in ms. */
  tickMs?: number;
  /** Milliseconds the output fades before the context is suspended (0 suspends at once). */
  gateFadeMs?: number;
}

/** Headroom so summed buses stay below full scale before the compressor. */
const MASTER_HEADROOM = 0.85;

function defaultCreateContext(): AudioContext {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
  const C = Ctor.AudioContext ?? Ctor.webkitAudioContext;
  if (!C) throw new Error('Web Audio is not available');
  return new C({ latencyHint: 'interactive' });
}

/**
 * Owns the one AudioContext (created lazily on the first user gesture), the bus graph, the
 * voice limiter and the lookahead tick that drives every scheduler.
 */
export class AudioEngine {
  readonly limiter: VoiceLimiter;
  readonly seed: number;
  private ctx: AudioContext | null = null;
  private busGraph: Buses | null = null;
  private noiseBank: NoiseBank | null = null;
  private unlocked = false;
  private paused = false;
  private hidden = false;
  private audio: AudioSettings | null = null;
  private ducked = false;
  private captionDucked = false;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly gateFadeMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private resuming = false;
  private disposed = false;
  private readonly tickers = new Set<(now: number) => void>();
  private readonly readyListeners = new Set<(ctx: AudioContext) => void>();
  private readonly createContext: () => AudioContext;
  private readonly tickMs: number;

  constructor(opts: EngineOptions = {}) {
    this.createContext = opts.createContext ?? defaultCreateContext;
    this.seed = opts.seed ?? (Date.now() & 0x7fffffff);
    this.limiter = new VoiceLimiter(opts.maxVoices ?? 20);
    this.tickMs = opts.tickMs ?? 100;
    this.gateFadeMs = opts.gateFadeMs ?? 90;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get buses(): Buses | null {
    return this.busGraph;
  }

  get noise(): NoiseBank | null {
    return this.noiseBank;
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  /** 'none' until the first gesture created the context. */
  get state(): AudioContextState | 'none' {
    return this.ctx ? this.ctx.state : 'none';
  }

  /** Whether sound should currently be flowing. */
  get wantsRunning(): boolean {
    return this.unlocked && !this.paused && !this.hidden && !this.disposed;
  }

  /** Called from a user gesture: creates the context on first use and resumes it. */
  unlock(): void {
    if (this.disposed) return;
    this.unlocked = true;
    if (!this.ctx) this.build();
    this.reconcile();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.reconcile();
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.reconcile();
  }

  /** Smoothly binds bus gains to settings.audio. Safe to call before the context exists. */
  applySettings(audio: AudioSettings): void {
    this.audio = audio;
    const ctx = this.ctx;
    const b = this.busGraph;
    if (!ctx || !b) return;
    const now = ctx.currentTime;
    rampTo(b.master.gain, audio.master * MASTER_HEADROOM, now);
    rampTo(b.music.gain, audio.music, now);
    rampTo(b.sfx.gain, audio.sfx, now);
    rampTo(b.ambience.gain, audio.sfx, now);
    rampTo(b.narration.gain, audio.narration, now);
  }

  /** Dips the music (and a little of the ambience) while narration is spoken. */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
    this.applyDuck();
  }

  /** A lighter dip while a caption is on screen, voiced or not. */
  setCaptionDuck(ducked: boolean): void {
    this.captionDucked = ducked;
    this.applyDuck();
  }

  get isDucked(): boolean {
    return this.ducked;
  }

  get isCaptionDucked(): boolean {
    return this.captionDucked;
  }

  private applyDuck(): void {
    const ctx = this.ctx;
    const b = this.busGraph;
    if (!ctx || !b) return;
    const music = this.ducked ? 0.5 : this.captionDucked ? 0.72 : 1;
    const ambience = this.ducked ? 0.75 : this.captionDucked ? 0.9 : 1;
    // Down quickly, back up slowly, so the return never pumps.
    const now = ctx.currentTime;
    rampTo(b.musicDuck.gain, music, now, music < b.musicDuck.gain.value ? 0.12 : 0.5);
    rampTo(b.ambienceDuck.gain, ambience, now, ambience < b.ambienceDuck.gain.value ? 0.12 : 0.5);
  }

  /** Registers a scheduler; it is called every tick while the context is running. */
  onTick(fn: (now: number) => void): () => void {
    this.tickers.add(fn);
    return () => this.tickers.delete(fn);
  }

  /** Called once the context exists (immediately if it already does). */
  onReady(fn: (ctx: AudioContext) => void): () => void {
    this.readyListeners.add(fn);
    if (this.ctx) fn(this.ctx);
    return () => this.readyListeners.delete(fn);
  }

  /** One scheduler step. Public so tests can drive time deterministically. */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.limiter.prune(now);
    for (const fn of this.tickers) {
      try {
        fn(now);
      } catch (error) {
        console.error('[netivim] audio scheduler failed', error);
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimer();
    this.clearSuspendTimer();
    this.tickers.clear();
    this.readyListeners.clear();
    this.limiter.clear();
    const ctx = this.ctx;
    this.ctx = null;
    this.busGraph = null;
    this.noiseBank = null;
    if (ctx) {
      ctx.onstatechange = null;
      void ctx.close().catch(() => undefined);
    }
  }

  private build(): void {
    let ctx: AudioContext;
    try {
      ctx = this.createContext();
    } catch (error) {
      console.error('[netivim] audio unavailable', error);
      this.unlocked = false;
      return;
    }
    const master = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.25;
    // A second, fast compressor acts as a safety limiter so summed layers can never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    const gate = ctx.createGain();
    master.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(gate);
    gate.connect(ctx.destination);
    const music = ctx.createGain();
    const musicDuck = ctx.createGain();
    const sfx = ctx.createGain();
    const ambience = ctx.createGain();
    const ambienceDuck = ctx.createGain();
    const narration = ctx.createGain();
    musicDuck.connect(music);
    ambience.connect(ambienceDuck);
    for (const bus of [music, sfx, ambienceDuck, narration]) bus.connect(master);
    this.ctx = ctx;
    this.busGraph = { master, music, musicDuck, sfx, ambience, ambienceDuck, gate, narration };
    this.noiseBank = new NoiseBank(ctx, this.seed);
    // Start from the saved levels without a ramp, so the first sound is not a fade-in click.
    const a = this.audio;
    if (a) {
      master.gain.value = a.master * MASTER_HEADROOM;
      music.gain.value = a.music;
      sfx.gain.value = a.sfx;
      ambience.gain.value = a.sfx;
      narration.gain.value = a.narration;
    }
    this.applyDuck();
    // The platform may suspend the context on its own (call, audio focus); recover when wanted.
    ctx.onstatechange = () => this.reconcile();
    for (const fn of [...this.readyListeners]) {
      try {
        fn(ctx);
      } catch (error) {
        console.error('[netivim] audio ready handler failed', error);
      }
    }
  }

  private clearSuspendTimer(): void {
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
  }

  /**
   * Makes the context match what we want: running when active, suspended when paused or hidden.
   * Suspending first fades the output gate to silence and resuming fades it back, so neither
   * edge clicks.
   */
  private reconcile(): void {
    const ctx = this.ctx;
    const gate = this.busGraph?.gate;
    if (!ctx || !gate || this.disposed) return;
    if (this.wantsRunning) {
      this.clearSuspendTimer();
      if (ctx.state !== 'running') {
        if (!this.resuming) {
          this.resuming = true;
          gate.gain.cancelScheduledValues(ctx.currentTime);
          gate.gain.value = 0;
          void ctx
            .resume()
            .catch(() => undefined)
            .finally(() => {
              this.resuming = false;
              const c = this.ctx;
              if (c && this.busGraph) rampTo(this.busGraph.gate.gain, 1, c.currentTime, 0.03);
              // The wish may have changed while the promise was pending.
              if (!this.wantsRunning && this.ctx?.state === 'running') this.reconcile();
              else this.syncTimer();
            });
        }
      } else {
        rampTo(gate.gain, 1, ctx.currentTime, 0.03);
      }
    } else if (ctx.state === 'running' && this.suspendTimer === null) {
      if (this.gateFadeMs <= 0) this.suspendNow();
      else {
        rampTo(gate.gain, 0, ctx.currentTime, this.gateFadeMs / 3000);
        this.suspendTimer = setTimeout(() => {
          this.suspendTimer = null;
          if (!this.wantsRunning) this.suspendNow();
        }, this.gateFadeMs);
      }
    }
    this.syncTimer();
  }

  private suspendNow(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    void ctx
      .suspend()
      .catch(() => undefined)
      .finally(() => {
        if (this.wantsRunning && this.ctx && this.ctx.state !== 'running') this.reconcile();
        else this.syncTimer();
      });
  }

  private syncTimer(): void {
    if (this.wantsRunning && this.ctx) {
      if (this.timer === null) this.timer = setInterval(() => this.tick(), this.tickMs);
    } else {
      this.stopTimer();
    }
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
