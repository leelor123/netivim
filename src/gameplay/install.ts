import './gameplay.css';
import type { Game } from '../game';
import { Director } from './director';
import { getRenderPipeline, type RenderPipeline } from '../render/renderPipeline';

declare global {
  interface Window {
    /** E2E hook; only present in builds made with VITE_TEST_HOOKS=1. */
    __netivimGameplay?: Director;
    /** E2E diagnostics hook (VITE_TEST_HOOKS=1): the render pipeline (warm-up state). */
    __netivimPipeline?: RenderPipeline | undefined;
  }
}

/**
 * Gameplay framework plug-in (docs/CONTRACTS.md section 11): chapter flow, mission host, HUD,
 * codex and archive. Loaded lazily from main.ts so it stays out of the initial bundle.
 */
export function installGameplay(game: Game): () => void {
  const director = new Director(game);
  // Installed after boot: if the flow already reached the hub, show it now.
  if (game.flow.state === 'hub') director.showHubMenu();
  if (import.meta.env.VITE_TEST_HOOKS === '1') {
    window.__netivimGameplay = director;
    window.__netivimPipeline = getRenderPipeline(game.renderer);
  }
  return () => {
    director.dispose();
    if (window.__netivimGameplay === director) delete window.__netivimGameplay;
  };
}
