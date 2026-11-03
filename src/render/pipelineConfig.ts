import type { FpsCap, GraphicsOptions, ShadowQuality } from '../core/settings';

/** Device pixel ratio is never rendered above this (BRIEF 7: native capped at 2x). */
export const MAX_PIXEL_RATIO = 2;
/**
 * resolutionScale 1.0 means this pixel ratio (or the device DPR if lower). Phones report DPR 3-4;
 * 1.5 keeps "100%" sharp while leaving the full native 2x for Ultra (resolutionScale 0).
 */
export const REFERENCE_PIXEL_RATIO = 1.5;

export const SHADOW_MAP_SIZE: Readonly<Record<ShadowQuality, number>> = {
  off: 0,
  low: 512,
  medium: 1024,
  high: 2048,
  ultra: 4096,
};

/** PCF filter radius in shadow-map texels (soft penumbra; Vogel disk in r186 PCF). */
export const SHADOW_RADIUS: Readonly<Record<ShadowQuality, number>> = {
  off: 0,
  low: 1,
  medium: 1.5,
  high: 2,
  ultra: 2.5,
};

/** Fraction of the scene's shadow distance that gets shadows at each level. */
export const SHADOW_DISTANCE_SCALE: Readonly<Record<ShadowQuality, number>> = {
  off: 0,
  low: 0.5,
  medium: 0.75,
  high: 0.9,
  ultra: 1,
};

/** Everything the renderer and post chain need, derived from GraphicsOptions plus the device. */
export interface PipelineConfig {
  readonly pixelRatio: number;
  readonly fpsCap: FpsCap;
  readonly shadowMapSize: number;
  readonly shadowRadius: number;
  readonly shadowDistanceScale: number;
  readonly msaaSamples: number;
  readonly smaa: boolean;
  readonly fxaa: boolean;
  readonly ambientOcclusion: boolean;
  readonly bloom: boolean;
  /** Screen-space light shafts toward the sun: part of "fog and atmosphere" on the top tier. */
  readonly lightShafts: boolean;
  readonly grading: boolean;
  /** Dithering rides on the final grading pass (no extra cost). */
  readonly dither: boolean;
  /** Allowed by settings; only active while a cutscene requests it (setDepthOfField). */
  readonly depthOfField: boolean;
  readonly motionBlur: boolean;
  readonly fog: boolean;
}

export interface DeviceInfo {
  readonly devicePixelRatio: number;
  readonly maxTextureSize: number;
  readonly maxSamples: number;
}

export function pixelRatioFor(resolutionScale: number, devicePixelRatio: number): number {
  const dpr = Math.max(0.5, devicePixelRatio || 1);
  if (resolutionScale === 0) return Math.min(dpr, MAX_PIXEL_RATIO);
  const reference = Math.min(dpr, REFERENCE_PIXEL_RATIO);
  return Math.max(0.5, Math.min(MAX_PIXEL_RATIO, reference * resolutionScale));
}

export function toPipelineConfig(o: GraphicsOptions, device: DeviceInfo): PipelineConfig {
  const wantedShadow = SHADOW_MAP_SIZE[o.shadows];
  const shadowMapSize = wantedShadow === 0 ? 0 : Math.min(wantedShadow, Math.max(512, device.maxTextureSize));
  const msaa = o.antialias === 'msaa';
  // Light shafts are a premium atmosphere layer: they need fog/atmosphere and the bloom tier.
  const lightShafts = o.fog && o.bloom && o.shadows === 'ultra';
  return {
    pixelRatio: pixelRatioFor(o.resolutionScale, device.devicePixelRatio),
    fpsCap: o.fpsCap,
    shadowMapSize,
    shadowRadius: SHADOW_RADIUS[o.shadows],
    shadowDistanceScale: SHADOW_DISTANCE_SCALE[o.shadows],
    msaaSamples: msaa ? Math.min(4, device.maxSamples) : 0,
    smaa: o.antialias === 'smaa' || msaa,
    fxaa: o.antialias === 'fxaa',
    ambientOcclusion: o.ambientOcclusion,
    bloom: o.bloom,
    lightShafts,
    grading: o.colorGrading,
    dither: o.colorGrading,
    depthOfField: o.depthOfField,
    motionBlur: o.motionBlur,
    fog: o.fog,
  };
}

/**
 * True when any screen-space pass runs. The EffectComposer exists only then; otherwise the
 * renderer draws straight to the canvas and low presets pay nothing for post.
 */
export function needsComposer(c: PipelineConfig, depthOfFieldActive: boolean): boolean {
  return (
    c.msaaSamples > 0 ||
    c.smaa ||
    c.fxaa ||
    c.ambientOcclusion ||
    c.bloom ||
    c.lightShafts ||
    c.grading ||
    c.motionBlur ||
    (c.depthOfField && depthOfFieldActive)
  );
}

/**
 * A key that changes only when the pass chain must be rebuilt (not for pixel ratio or fps).
 * Depth of field is built in (disabled) whenever settings allow it, so a cutscene switching it
 * on never rebuilds the chain or compiles shaders mid-scene.
 */
export function chainKey(c: PipelineConfig): string {
  return [
    c.msaaSamples,
    c.smaa ? 1 : 0,
    c.fxaa ? 1 : 0,
    c.ambientOcclusion ? 1 : 0,
    c.bloom ? 1 : 0,
    c.lightShafts ? 1 : 0,
    c.grading ? 1 : 0,
    c.motionBlur ? 1 : 0,
    c.depthOfField ? 1 : 0,
  ].join('');
}
