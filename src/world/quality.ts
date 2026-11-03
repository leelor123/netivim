import type { GraphicsOptions, GraphicsPreset, Settings } from '../core/settings';

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
export const PRESET_QUALITY: Readonly<Record<GraphicsPreset, WorldQuality>> = {
  battery: { tier: 0, vegetation: 0.25, particles: 0.15, lodDistance: 0.6, renderDistance: 0.6, shadows: false, fog: true },
  low: { tier: 1, vegetation: 0.4, particles: 0.3, lodDistance: 0.75, renderDistance: 0.75, shadows: false, fog: true },
  medium: { tier: 2, vegetation: 0.6, particles: 0.5, lodDistance: 0.9, renderDistance: 0.9, shadows: true, fog: true },
  high: { tier: 3, vegetation: 0.8, particles: 0.75, lodDistance: 1, renderDistance: 1, shadows: true, fog: true },
  ultra: { tier: 4, vegetation: 1, particles: 1, lodDistance: 1.25, renderDistance: 1.25, shadows: true, fog: true },
};

export const DEFAULT_WORLD_QUALITY: WorldQuality = PRESET_QUALITY.high;

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
  return s.graphics.mode === 'custom' ? fromGraphicsOptions(s.graphics.custom) : PRESET_QUALITY[s.graphics.preset];
}

/** Instance count for a base count at a density (0-1), never negative. */
export function densityCount(base: number, density: number): number {
  return Math.max(0, Math.round(base * Math.min(1, Math.max(0, density))));
}
