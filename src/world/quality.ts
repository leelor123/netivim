import type { GraphicsOptions, GraphicsPreset, Settings } from '../core/settings';
import { PRESETS, resolveGraphics } from '../render/presets';

/** The subset of graphics settings the world needs, plus a coarse tier for lights. */
export interface WorldQuality {
  /** 0 battery .. 4 ultra. */
  readonly tier: number;
  /** 0-1 density multipliers. */
  readonly vegetation: number;
  readonly particles: number;
  /** 0.5-1.5 multipliers. */
  readonly lodDistance: number;
  readonly renderDistance: number;
  readonly shadows: boolean;
  readonly fog: boolean;
}

/**
 * Provisional preset table for world density. The Graphics agent owns the authoritative
 * preset -> GraphicsOptions mapping; once it exists, scenes should pass fromGraphicsOptions().
 */



const SHADOW_TIER: Readonly<Record<GraphicsOptions['shadows'], number>> = { off: 1, low: 1, medium: 2, high: 3, ultra: 4 };

export function fromGraphicsOptions(g: GraphicsOptions): WorldQuality {
  return {
    tier: SHADOW_TIER[g.shadows],
    vegetation: g.vegetation,
    particles: g.particles,
    lodDistance: g.lodDistance,
    renderDistance: g.renderDistance,
    shadows: g.shadows !== 'off',
    fog: g.fog,
  };
}

export function worldQualityFromSettings(s: Settings): WorldQuality {
  return fromGraphicsOptions(resolveGraphics(s.graphics).options);
}

/** Instance count for a base count at a density (0-1), never negative. */
export function densityCount(base: number, density: number): number {
  return Math.max(0, Math.round(base * Math.min(1, Math.max(0, density))));
}

/** World quality for each graphics preset, derived from the Graphics PRESETS table (single source of truth). */
export const PRESET_QUALITY: Readonly<Record<GraphicsPreset, WorldQuality>> = {
  battery: fromGraphicsOptions(PRESETS.battery),
  low: fromGraphicsOptions(PRESETS.low),
  medium: fromGraphicsOptions(PRESETS.medium),
  high: fromGraphicsOptions(PRESETS.high),
  ultra: fromGraphicsOptions(PRESETS.ultra),
};

export const DEFAULT_WORLD_QUALITY: WorldQuality = PRESET_QUALITY.high;
