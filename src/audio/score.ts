import type { AudioEngine } from './engine';
import type { ContentIntensity } from './intensity';
import { LOOKAHEAD, ScoreLayer, type LayerRequest } from './layer';
import { MoodMachine, type MoodState } from './mood';
import { layerKey, missionYear, resolveEra, type MoodName } from './theory';

type Desired = { readonly kind: 'mood'; readonly mood: MoodName; readonly era: number } | { readonly kind: 'title' } | { readonly kind: 'none' };

/** Mood implied by an ambience bed, for missions whose level sends no audio:mood of its own. */
const BED_MOODS: Readonly<Record<string, MoodName>> = {
  village: 'calm',
  city: 'calm',
  harbor: 'calm',
  sea: 'calm',
  desert: 'calm',
  dusk: 'reflective',
  night: 'reflective',
  beach: 'tense',
  'town-night': 'reflective',
};

/** Drives the Era Score: turns audio:mood / title requests into crossfaded generated layers. */
export class EraScore {
  private machine: MoodMachine<ScoreLayer> | null = null;
  private desired: Desired = { kind: 'none' };
  private readonly requests = new Map<string, LayerRequest>();
  private serial = 0;
  private gentle = false;
  private sparse = false;
  private missionEra: number | null = null;
  private moodSeen = false;

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

  get isSparse(): boolean {
    return this.sparse;
  }

  setMood(mood: MoodName, era: number): void {
    this.moodSeen = true;
    this.desired = { kind: 'mood', mood, era };
    this.apply();
  }

  /** Moves the running mood to another one in the same era (e.g. into the debrief). */
  settleTo(mood: MoodName): void {
    if (this.desired.kind !== 'mood' || this.desired.mood === mood) return;
    this.desired = { kind: 'mood', mood, era: this.desired.era };
    this.apply();
  }

  playTitle(): void {
    this.desired = { kind: 'title' };
    this.apply();
  }

  /** A mission began: remember its year (null for unknown) and wait for its own mood request. */
  startMission(missionId: string): void {
    this.missionEra = missionYear(missionId);
    this.moodSeen = false;
  }

  /** Falls back to a bed-implied mood when the running mission never asked for one. */
  noteBed(bed: string): void {
    if (this.moodSeen || this.missionEra === null) return;
    const mood = BED_MOODS[bed];
    if (!mood) return;
    this.desired = { kind: 'mood', mood, era: this.missionEra };
    this.apply();
  }

  /** Content Intensity: gentle crossfades to softer variants of the tense music. */
  setContentIntensity(mode: ContentIntensity): void {
    const gentle = mode === 'gentle';
    if (gentle === this.gentle) return;
    this.gentle = gentle;
    this.apply();
  }

  /** Thins the music while narration or captions are on screen. */
  setSparse(on: boolean): void {
    this.sparse = on;
    this.machine?.setSparse(on);
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
      if (this.sparse) this.machine.setSparse(true);
    }
    const d = this.desired;
    let req: LayerRequest;
    if (d.kind === 'title') {
      req = { key: 'title', mood: 'hopeful', era: 1990, title: true };
    } else {
      const era = resolveEra(d.era, this.missionEra);
      req = { key: layerKey(d.mood, era, this.gentle), mood: d.mood, era, title: false, gentle: this.gentle };
    }
    this.requests.set(req.key, req);
    this.machine.request(req.key, ctx.currentTime);
  }

  dispose(): void {
    this.machine?.dispose();
    this.machine = null;
  }
}
