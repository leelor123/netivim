import type { GraphicsOptions, GraphicsPreset, Settings } from '../core/settings';

/** Presets from lowest to highest cost. Adaptive quality walks this list downwards. */
export const PRESET_ORDER: readonly GraphicsPreset[] = ['battery', 'low', 'medium', 'high', 'ultra'];

/**
 * The preset table (docs/DESIGN.md section 8). Each row is a complete GraphicsOptions so a preset
 * can be copied into Custom as a starting point.
 *
 * resolutionScale is relative to the reference pixel ratio (see pipelineConfig.ts); 0 = native.
 * antialias 'msaa' means MSAA 4x on the scene buffer plus an SMAA edge pass (the Ultra setting).
 */
export const PRESETS: Readonly<Record<GraphicsPreset, GraphicsOptions>> = {
  battery: {
    resolutionScale: 0.6,
    fpsCap: 30,
    shadows: 'off',
    antialias: 'none',
    ambientOcclusion: false,
    bloom: false,
    fog: false,
    particles: 0.25,
    vegetation: 0.35,
    renderDistance: 0.6,
    lodDistance: 0.6,
    colorGrading: false,
    depthOfField: false,
    motionBlur: false,
  },
  low: {
    resolutionScale: 0.75,
    fpsCap: 60,
    shadows: 'off',
    antialias: 'fxaa',
    ambientOcclusion: false,
    bloom: false,
    fog: false,
    particles: 0.4,
    vegetation: 0.5,
    renderDistance: 0.75,
    lodDistance: 0.75,
    colorGrading: false,
    depthOfField: false,
    motionBlur: false,
  },
  medium: {
    resolutionScale: 0.85,
    fpsCap: 60,
    shadows: 'medium',
    antialias: 'fxaa',
    ambientOcclusion: false,
    bloom: false,
    fog: true,
    particles: 0.6,
    vegetation: 0.7,
    renderDistance: 0.9,
    lodDistance: 0.9,
    colorGrading: false,
    depthOfField: false,
    motionBlur: false,
  },
  high: {
    resolutionScale: 1,
    fpsCap: 60,
    shadows: 'high',
    antialias: 'smaa',
    ambientOcclusion: false,
    bloom: true,
    fog: true,
    particles: 0.8,
    vegetation: 0.85,
    renderDistance: 1.1,
    lodDistance: 1.1,
    colorGrading: true,
    depthOfField: true,
    motionBlur: false,
  },
  ultra: {
    resolutionScale: 0,
    fpsCap: 60,
    shadows: 'ultra',
    antialias: 'msaa',
    ambientOcclusion: true,
    bloom: true,
    fog: true,
    particles: 1,
    vegetation: 1,
    renderDistance: 1.5,
    lodDistance: 1.5,
    colorGrading: true,
    depthOfField: true,
    motionBlur: false,
  },
};

export type GraphicsSettings = Settings['graphics'];

/** What the pipeline should run right now, and where it came from. */
export interface ResolvedGraphics {
  readonly options: GraphicsOptions;
  /** The preset in effect, or null for Custom. */
  readonly preset: GraphicsPreset | null;
}

export function presetIndex(p: GraphicsPreset): number {
  return PRESET_ORDER.indexOf(p);
}

/** The next cheaper preset, or null at the bottom. */
export function presetBelow(p: GraphicsPreset): GraphicsPreset | null {
  const i = presetIndex(p);
  return i > 0 ? (PRESET_ORDER[i - 1] ?? null) : null;
}

/** The cheaper of two presets. */
export function minPreset(a: GraphicsPreset, b: GraphicsPreset): GraphicsPreset {
  return presetIndex(a) <= presetIndex(b) ? a : b;
}

/**
 * Settings -> effective options. auto: the benchmarked preset (settings.preset holds the result);
 * preset: the chosen preset; custom: the custom options. `cap` is a runtime ceiling (adaptive
 * quality, battery saver) that applies to auto and preset modes, never to Custom (the player chose
 * every value by hand).
 */
export function resolveGraphics(g: GraphicsSettings, cap: GraphicsPreset | null = null): ResolvedGraphics {
  if (g.mode === 'custom') return { options: g.custom, preset: null };
  const preset = cap === null ? g.preset : minPreset(g.preset, cap);
  return { options: PRESETS[preset], preset };
}
