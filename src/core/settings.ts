import type { EventBus } from './events';
import type { GameEvents } from './gameEvents';
import { DEFAULT_BINDINGS, sanitizeBindings, type Bindings } from './input/bindings';
import type { DifficultyLevel } from './difficulty';
import { readSlot, writeSlot } from './save/slots';
import type { SyncStore } from './save/stores';

export const SETTINGS_SLOT = 'settings';
export const SETTINGS_VERSION = 1;

export type GraphicsPreset = 'battery' | 'low' | 'medium' | 'high' | 'ultra';
export type GraphicsMode = 'auto' | 'preset' | 'custom';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high' | 'ultra';
export type AntiAliasing = 'none' | 'fxaa' | 'smaa' | 'msaa';
export type FpsCap = 30 | 60 | 0;

/** Every individually adjustable graphics option (BRIEF 7, Custom). */
export interface GraphicsOptions {
  /** 0.5-1 of the device resolution; 0 means native (device pixel ratio, capped at 2). */
  readonly resolutionScale: number;
  readonly fpsCap: FpsCap;
  readonly shadows: ShadowQuality;
  readonly antialias: AntiAliasing;
  readonly ambientOcclusion: boolean;
  readonly bloom: boolean;
  readonly fog: boolean;
  /** 0-1 density multipliers. */
  readonly particles: number;
  readonly vegetation: number;
  /** 0.5-1.5 multipliers. */
  readonly renderDistance: number;
  readonly lodDistance: number;
  readonly colorGrading: boolean;
  readonly depthOfField: boolean;
  readonly motionBlur: boolean;
}

export interface Settings {
  readonly version: typeof SETTINGS_VERSION;
  readonly graphics: {
    readonly mode: GraphicsMode;
    /** Used when mode is 'preset', and as the result of the 'auto' benchmark. */
    readonly preset: GraphicsPreset;
    /** Used when mode is 'custom'. */
    readonly custom: GraphicsOptions;
    /** Set once the first-launch benchmark has run. */
    readonly benchmarked: boolean;
    readonly debugOverlay: boolean;
  };
  readonly audio: {
    readonly master: number;
    readonly music: number;
    readonly sfx: number;
    readonly narration: number;
    /** Use SpeechSynthesis when available; subtitles are always shown. */
    readonly voice: boolean;
  };
  readonly accessibility: {
    readonly subtitleSize: 'small' | 'medium' | 'large' | 'xlarge';
    readonly reducedMotion: boolean;
    readonly contentIntensity: 'gentle' | 'standard';
  };
  readonly gameplay: {
    readonly difficulty: DifficultyLevel;
  };
  readonly controls: {
    readonly bindings: Bindings;
    readonly vibration: boolean;
    readonly touchSize: number;
    readonly touchOpacity: number;
    readonly touchLayout: 'right-handed' | 'left-handed';
  };
}

export type SettingsSection = Exclude<keyof Settings, 'version'>;

export const DEFAULT_GRAPHICS_OPTIONS: GraphicsOptions = {
  resolutionScale: 1,
  fpsCap: 60,
  shadows: 'high',
  antialias: 'smaa',
  ambientOcclusion: false,
  bloom: true,
  fog: true,
  particles: 0.75,
  vegetation: 0.75,
  renderDistance: 1,
  lodDistance: 1,
  colorGrading: true,
  depthOfField: true,
  motionBlur: false,
};

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  graphics: { mode: 'auto', preset: 'high', custom: DEFAULT_GRAPHICS_OPTIONS, benchmarked: false, debugOverlay: false },
  audio: { master: 0.9, music: 0.7, sfx: 0.8, narration: 1, voice: true },
  accessibility: { subtitleSize: 'medium', reducedMotion: false, contentIntensity: 'standard' },
  gameplay: { difficulty: 'normal' },
  controls: { bindings: DEFAULT_BINDINGS, vibration: true, touchSize: 1, touchOpacity: 0.7, touchLayout: 'right-handed' },
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const num = (v: unknown, min: number, max: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
function pick<T extends string | number>(v: unknown, allowed: readonly T[], d: T): T {
  return allowed.includes(v as T) ? (v as T) : d;
}

function sanitizeGraphicsOptions(v: unknown): GraphicsOptions {
  const o = obj(v);
  const d = DEFAULT_GRAPHICS_OPTIONS;
  const scale = o.resolutionScale === 0 ? 0 : num(o.resolutionScale, 0.5, 1, d.resolutionScale);
  return {
    resolutionScale: scale,
    fpsCap: pick(o.fpsCap, [30, 60, 0] as const, d.fpsCap),
    shadows: pick(o.shadows, ['off', 'low', 'medium', 'high', 'ultra'] as const, d.shadows),
    antialias: pick(o.antialias, ['none', 'fxaa', 'smaa', 'msaa'] as const, d.antialias),
    ambientOcclusion: bool(o.ambientOcclusion, d.ambientOcclusion),
    bloom: bool(o.bloom, d.bloom),
    fog: bool(o.fog, d.fog),
    particles: num(o.particles, 0, 1, d.particles),
    vegetation: num(o.vegetation, 0, 1, d.vegetation),
    renderDistance: num(o.renderDistance, 0.5, 1.5, d.renderDistance),
    lodDistance: num(o.lodDistance, 0.5, 1.5, d.lodDistance),
    colorGrading: bool(o.colorGrading, d.colorGrading),
    depthOfField: bool(o.depthOfField, d.depthOfField),
    motionBlur: bool(o.motionBlur, d.motionBlur),
  };
}

/**
 * Turns anything loaded from storage into valid Settings: unknown or invalid fields fall back to
 * defaults field by field, so one bad value never resets everything.
 */
export function sanitizeSettings(v: unknown): Settings {
  const s = obj(v);
  const g = obj(s.graphics);
  const a = obj(s.audio);
  const acc = obj(s.accessibility);
  const gp = obj(s.gameplay);
  const c = obj(s.controls);
  const D = DEFAULT_SETTINGS;
  return {
    version: SETTINGS_VERSION,
    graphics: {
      mode: pick(g.mode, ['auto', 'preset', 'custom'] as const, D.graphics.mode),
      preset: pick(g.preset, ['battery', 'low', 'medium', 'high', 'ultra'] as const, D.graphics.preset),
      custom: sanitizeGraphicsOptions(g.custom),
      benchmarked: bool(g.benchmarked, false),
      debugOverlay: bool(g.debugOverlay, false),
    },
    audio: {
      master: num(a.master, 0, 1, D.audio.master),
      music: num(a.music, 0, 1, D.audio.music),
      sfx: num(a.sfx, 0, 1, D.audio.sfx),
      narration: num(a.narration, 0, 1, D.audio.narration),
      voice: bool(a.voice, D.audio.voice),
    },
    accessibility: {
      subtitleSize: pick(acc.subtitleSize, ['small', 'medium', 'large', 'xlarge'] as const, D.accessibility.subtitleSize),
      reducedMotion: bool(acc.reducedMotion, D.accessibility.reducedMotion),
      contentIntensity: pick(acc.contentIntensity, ['gentle', 'standard'] as const, D.accessibility.contentIntensity),
    },
    gameplay: { difficulty: pick(gp.difficulty, ['story', 'normal', 'challenge'] as const, D.gameplay.difficulty) },
    controls: {
      bindings: c.bindings === undefined ? DEFAULT_BINDINGS : sanitizeBindings(c.bindings),
      vibration: bool(c.vibration, D.controls.vibration),
      touchSize: num(c.touchSize, 0.75, 1.5, D.controls.touchSize),
      touchOpacity: num(c.touchOpacity, 0.3, 1, D.controls.touchOpacity),
      touchLayout: pick(c.touchLayout, ['right-handed', 'left-handed'] as const, D.controls.touchLayout),
    },
  };
}

/** Loads, validates, updates and persists settings. Every change is saved immediately (BRIEF 8.D). */
export class SettingsManager {
  private current: Settings;

  constructor(
    private readonly bus: EventBus<GameEvents>,
    private readonly store: SyncStore,
  ) {
    let loaded: unknown;
    try {
      loaded = readSlot(store, SETTINGS_SLOT, () => true)?.env.payload ?? null;
    } catch {
      loaded = null;
    }
    this.current = loaded === null ? DEFAULT_SETTINGS : sanitizeSettings(loaded);
  }

  get value(): Settings {
    return this.current;
  }

  /** Replaces one section (validated), saves, and notifies listeners. */
  update<K extends SettingsSection>(section: K, patch: Partial<Settings[K]>): Settings {
    const next = sanitizeSettings({ ...this.current, [section]: { ...this.current[section], ...patch } });
    this.current = next;
    this.persist();
    this.bus.emit('settings:changed', { key: section });
    return next;
  }

  resetToDefaults(): void {
    this.current = DEFAULT_SETTINGS;
    this.persist();
    for (const key of ['graphics', 'audio', 'accessibility', 'gameplay', 'controls'] as const) {
      this.bus.emit('settings:changed', { key });
    }
  }

  private persist(): void {
    try {
      writeSlot(this.store, SETTINGS_SLOT, this.current, Date.now(), () => true);
    } catch (e) {
      this.bus.emit('save:failed', { slot: 'settings', reason: 'settings', error: e instanceof Error ? e.message : String(e) });
    }
  }
}
