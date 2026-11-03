import type { Game } from '../game';
import type { HubOptions, HubScene } from '../scene/hubScene';
import type { SampleSceneOptions, WorldScene } from './sampleScene';
import { PRESET_QUALITY, worldQualityFromSettings, type WorldQuality } from './quality';

/** Lazy world entry points (each loads its own chunk on first use). */
export interface WorldApi {
  createHubScene(opts?: HubOptions): Promise<HubScene>;
  createSampleScene(opts?: SampleSceneOptions): Promise<WorldScene>;
  qualityFor(preset: keyof typeof PRESET_QUALITY): WorldQuality;
  currentQuality(): WorldQuality;
}

declare global {
  interface Window {
    /** E2E hook for world scenes; only present in builds made with VITE_TEST_HOOKS=1. */
    __netivimWorld?: WorldApi;
  }
}

/**
 * Shows the Archive hub whenever the game flow enters 'hub'. World code stays out of the initial
 * bundle: hubScene and the kit load on demand.
 */
export function installWorld(game: Game): () => void {
  const api: WorldApi = {
    createHubScene: async (opts) => (await import('../scene/hubScene')).createHubScene(opts),
    createSampleScene: async (opts) => (await import('./sampleScene')).createSampleScene(opts),
    qualityFor: (preset) => PRESET_QUALITY[preset],
    currentQuality: () => worldQualityFromSettings(game.settings.value),
  };
  let token = 0;
  const off = game.bus.on('flow:changed', ({ to }) => {
    if (to !== 'hub') return;
    const mine = ++token;
    void api
      .createHubScene({ quality: api.currentQuality() })
      .then((hub) => {
        // A later transition (or uninstall) made this load stale.
        if (mine !== token || game.flow.state !== 'hub') hub.dispose();
        else game.scenes.switchTo(hub);
      })
      .catch((error: unknown) => {
        console.error('[netivim] hub scene failed to load', error);
      });
  });
  if (import.meta.env.VITE_TEST_HOOKS === '1') window.__netivimWorld = api;
  return () => {
    token++;
    off();
    if (window.__netivimWorld === api) delete window.__netivimWorld;
  };
}
