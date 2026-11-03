import type { AudioEngine } from './engine';
import { LOOKAHEAD, ScoreLayer, type LayerRequest } from './layer';
import { MoodMachine, type MoodState } from './mood';
import { layerKey, type MoodName } from './theory';

type Desired = { readonly kind: 'mood'; readonly mood: MoodName; readonly era: number } | { readonly kind: 'title' } | { readonly kind: 'none' };

/** Drives the Era Score: turns audio:mood / title requests into crossfaded generated layers. */
export class EraScore {
  private machine: MoodMachine<ScoreLayer> | null = null;
  private desired: Desired = { kind: 'none' };
  private readonly requests = new Map<string, LayerRequest>();
  private serial = 0;

  constructor(private readonly engine: AudioEngine) {}

  get state(): MoodState {
    return this.machine?.state ?? 'idle';
  }

  get currentKey(): string | null {
    return this.machine?.currentKey ?? null;
  }

  get layerCount(): number {
    return this.machine?.layerCount ?? 0;
  }

  setMood(mood: MoodName, era: number): void {
    this.desired = { kind: 'mood', mood, era };
    this.apply();
  }

  playTitle(): void {
    this.desired = { kind: 'title' };
    this.apply();
  }

  stop(): void {
    this.desired = { kind: 'none' };
    const ctx = this.engine.context;
    if (this.machine && ctx) this.machine.stop(ctx.currentTime);
  }

  /** Engine tick: finish fades and schedule upcoming notes. */
  tick(now: number): void {
    this.machine?.update(now, now + LOOKAHEAD);
  }

  /** (Re)applies the desired state once the context exists and runs. */
  apply(): void {
    const ctx = this.engine.context;
    const buses = this.engine.buses;
    if (!ctx || !buses || this.desired.kind === 'none') return;
    if (!this.machine) {
      this.machine = new MoodMachine<ScoreLayer>(
        (key) => {
          const req = this.requests.get(key);
          if (!req) throw new Error('unknown layer ' + key);
          // A fresh seed per layer instance keeps repeated visits from sounding identical.
          return new ScoreLayer(ctx, buses.musicDuck, req, this.engine.seed + this.serial++ * 7919);
        },
        { fadeOut: 3.5, maxLayers: 3 },
      );
    }
    const d = this.desired;
    const req: LayerRequest =
      d.kind === 'title'
        ? { key: 'title', mood: 'hopeful', era: 1990, title: true }
        : { key: layerKey(d.mood, d.era), mood: d.mood, era: d.era, title: false };
    this.requests.set(req.key, req);
    this.machine.request(req.key, ctx.currentTime);
  }

  dispose(): void {
    this.machine?.dispose();
    this.machine = null;
  }
}
