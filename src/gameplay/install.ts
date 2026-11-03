import './gameplay.css';
import type { Game } from '../game';
import { Director } from './director';

declare global {
  interface Window {
    /** E2E hook; only present in builds made with VITE_TEST_HOOKS=1. */
    __netivimGameplay?: Director;
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
  if (import.meta.env.VITE_TEST_HOOKS === '1') window.__netivimGameplay = director;
  return () => {
    director.dispose();
    if (window.__netivimGameplay === director) delete window.__netivimGameplay;
  };
}
