import type { Game } from '../game';
import { DEMO_CUTSCENE } from './demo';
import { createDomOverlay } from './overlay';
import { CutscenePlayer, SkipHold } from './player';
import type { CutsceneDefinition, DepthOfFieldTarget } from './types';

export { CutscenePlayer, SkipHold, compileCutscene } from './player';
export { validateCutscene } from './validate';
export { DEMO_CUTSCENE, DEMO_CUTSCENE_ID } from './demo';
export type * from './types';

const SEEN_KEY = 'netivim:cutscenes-seen';

let dofTarget: DepthOfFieldTarget | null = null;

/** Called by the graphics pipeline once it can do depth of field; pass null to unregister. */
export function setDepthOfFieldTarget(target: DepthOfFieldTarget | null): void {
  dofTarget = target;
}

/** Remembers which cutscenes the player has watched (instant skip is allowed afterwards). */
export interface SeenStore {
  has(id: string): boolean;
  add(id: string): void;
}

export function localSeenStore(): SeenStore {
  const read = (): Set<string> => {
    try {
      const raw: unknown = JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]');
      return new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []);
    } catch {
      return new Set();
    }
  };
  const seen = read();
  return {
    has: (id) => seen.has(id),
    add(id) {
      seen.add(id);
      try {
        window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
      } catch {
        // Storage blocked: instant skip just stays unavailable across launches.
      }
    },
  };
}

export type AfterFlow = 'none' | 'resumeMission' | 'toDebrief';

export interface CinematicsApi {
  readonly player: CutscenePlayer;
  register(def: CutsceneDefinition): void;
  /**
   * Plays a registered cutscene. If the game flow allows it the flow enters `cutscene` (so exit
   * auto-saves stay restricted) and `after` is sent when the cutscene ends.
   */
  play(id: string, after?: AfterFlow): boolean;
}

declare global {
  interface Window {
    /** E2E hook, only in test builds (VITE_TEST_HOOKS=1). */
    __netivimCinematics?: CinematicsApi;
  }
}

let activeApi: CinematicsApi | null = null;

/** The installed cinematics API (null before install or after uninstall). Gameplay plays chapter cutscenes through it. */
export function getCinematics(): CinematicsApi | null {
  return activeApi;
}

export function installCinematics(game: Game, seenStore: SeenStore = localSeenStore()): () => void {
  const overlay = createDomOverlay(game.i18n);
  const player = new CutscenePlayer({
    bus: game.bus,
    getCamera: () => game.scenes.active?.camera ?? null,
    isReducedMotion: () => game.reducedMotion(),
    overlay,
    getDepthOfFieldTarget: () => dofTarget,
  });
  const library = new Map<string, CutsceneDefinition>([[DEMO_CUTSCENE.id, DEMO_CUTSCENE]]);
  const skip = new SkipHold(1);
  let after: AfterFlow = 'none';
  let currentSeen = false;

  const endOff = player.onEnded((id) => {
    seenStore.add(id);
    skip.reset();
    const next = after;
    after = 'none';
    if (game.flow.state === 'cutscene' && next !== 'none') game.flow.send(next);
  });

  // Pause -> Exit during a cutscene leaves the flow: stop the player so nothing draws over menus.
  const flowOff = game.bus.on('flow:changed', ({ from, to }) => {
    if (from === 'cutscene' && to !== 'cutscene' && to !== 'debrief' && to !== 'mission' && player.playing) {
      after = 'none';
      player.skip();
    }
  });

  const api: CinematicsApi = {
    player,
    register: (def) => {
      library.set(def.id, def);
    },
    play(id, afterFlow = 'none') {
      const def = library.get(id);
      if (!def) return false;
      if (game.flow.can('playCutscene')) game.flow.send('playCutscene');
      after = afterFlow;
      currentSeen = seenStore.has(id);
      skip.reset();
      overlay.setReducedMotion(game.reducedMotion());
      player.play(def);
      return true;
    },
  };

  const stepOff = game.onStep((dt) => {
    if (!player.playing) return;
    const down = game.input.isDown('confirm') || game.input.isDown('back') || overlay.pointerHeld;
    if (overlay.consumeSkipRequest() || skip.update(dt, down, currentSeen)) {
      player.skip();
      return;
    }
    overlay.setSkipProgress(skip.progress);
    player.update(dt);
  });

  activeApi = api;
  if (import.meta.env.VITE_TEST_HOOKS === '1') window.__netivimCinematics = api;

  return () => {
    stepOff();
    endOff();
    flowOff();
    player.skip();
    overlay.dispose();
    if (window.__netivimCinematics === api) delete window.__netivimCinematics;
    if (activeApi === api) activeApi = null;
  };
}
