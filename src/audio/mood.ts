/** What the mood machine needs from a layer (real ones are ScoreLayer; tests use fakes). */
export interface MoodLayer {
  readonly key: string;
  readonly fadeInSeconds: number;
  fadeIn(now: number, seconds: number): void;
  fadeOut(now: number, seconds: number): void;
  schedule(until: number): void;
  stopScheduling(): void;
  dispose(): void;
}

export type MoodState = 'idle' | 'steady' | 'crossfading';
export type RequestResult = 'started' | 'crossfade' | 'unchanged';

interface Outgoing<L> {
  readonly layer: L;
  readonly endsAt: number;
}

export interface MoodMachineOptions {
  /** Seconds the outgoing layer takes to fade away. */
  fadeOut?: number;
  /** Most layers that may sound at once (incoming + outgoing); the oldest is cut first. */
  maxLayers?: number;
}

/**
 * State machine for the score: idle (silent) -> steady (one layer) -> crossfading (a new layer
 * fades in while the old one fades out) -> steady. Re-requesting what already plays does
 * nothing; a request during a crossfade starts a further fade without restarting the rest.
 */
export class MoodMachine<L extends MoodLayer> {
  private current: L | null = null;
  private currentReadyAt = 0;
  private outgoing: Outgoing<L>[] = [];
  private lastNow = 0;
  private readonly fadeOutSeconds: number;
  private readonly maxLayers: number;

  constructor(
    private readonly create: (key: string) => L,
    options: MoodMachineOptions = {},
  ) {
    this.fadeOutSeconds = options.fadeOut ?? 3.5;
    this.maxLayers = options.maxLayers ?? 3;
  }

  get state(): MoodState {
    if (!this.current) return this.outgoing.length > 0 ? 'crossfading' : 'idle';
    return this.outgoing.length > 0 || this.currentReadyAt > this.lastNow ? 'crossfading' : 'steady';
  }

  get currentKey(): string | null {
    return this.current?.key ?? null;
  }

  get layerCount(): number {
    return (this.current ? 1 : 0) + this.outgoing.length;
  }

  request(key: string, now: number): RequestResult {
    this.lastNow = now;
    if (this.current && this.current.key === key) return 'unchanged';
    const hadCurrent = this.current !== null;
    if (this.current) {
      this.current.fadeOut(now, this.fadeOutSeconds);
      this.outgoing.push({ layer: this.current, endsAt: now + this.fadeOutSeconds });
    }
    // Keep CPU bounded: cut the oldest fading layer when too many would sound at once.
    while (this.outgoing.length + 1 > this.maxLayers) {
      const old = this.outgoing.shift();
      old?.layer.dispose();
    }
    const layer = this.create(key);
    layer.fadeIn(now, layer.fadeInSeconds);
    this.current = layer;
    this.currentReadyAt = now + layer.fadeInSeconds;
    return hadCurrent ? 'crossfade' : 'started';
  }

  /** Per scheduler tick: finishes fades and lets the active layer schedule its notes. */
  update(now: number, until: number): void {
    this.lastNow = now;
    if (this.outgoing.length > 0) {
      const keep: Outgoing<L>[] = [];
      for (const o of this.outgoing) {
        if (o.endsAt <= now) o.layer.dispose();
        else keep.push(o);
      }
      this.outgoing = keep;
    }
    this.current?.schedule(until);
  }

  /** Fades everything out; the machine ends up idle once the fades complete. */
  stop(now: number, seconds = this.fadeOutSeconds): void {
    this.lastNow = now;
    if (this.current) {
      this.current.fadeOut(now, seconds);
      this.outgoing.push({ layer: this.current, endsAt: now + seconds });
      this.current = null;
    }
  }

  dispose(): void {
    this.current?.dispose();
    for (const o of this.outgoing) o.layer.dispose();
    this.current = null;
    this.outgoing = [];
  }
}
