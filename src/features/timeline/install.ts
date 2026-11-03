import type { ChapterId } from '../../content/eras';
import type { Game } from '../../game';
import type { GameScene, SceneManager } from '../../render/sceneManager';
import { createTitleScene } from '../../scene/titleScene';
import { LivingMapScreen, type MapSceneHost } from '../livingMap/livingMapScreen';
import { hostTimelineWithMap } from './host';
import { TimelineScreen } from './timelineScreen';

/** Scene host backed by the game's SceneManager; hiding restores a fresh scene from `restore`. */
export function sceneManagerHost(scenes: SceneManager, restore: () => GameScene): MapSceneHost {
  return {
    show: (scene) => scenes.switchTo(scene),
    hide: (scene) => {
      if (scenes.active === scene) scenes.switchTo(restore());
    },
  };
}

export interface LinkedView {
  readonly timeline: TimelineScreen;
  readonly map: LivingMapScreen;
  close(): void;
}

export interface TimelineFeature {
  /** Creates the standalone timeline screen (host it with mount/unmount/onAction/update). */
  createTimeline(options: { onSelect: (id: ChapterId) => void; onBack?: () => void; embedded?: boolean }): TimelineScreen;
  /** Creates the Living Map screen (its 3D scene is shown through the SceneManager). */
  createMap(options?: { onBack?: () => void }): LivingMapScreen;
  /** Mounts map plus linked timeline under `root` and wires game input. Returns a closer. */
  openLinked(root: HTMLElement, options: { onSelect: (id: ChapterId) => void; onBack?: () => void }): LinkedView;
}

declare global {
  interface Window {
    /** E2E hook; only present in builds made with VITE_TEST_HOOKS=1. */
    __netivimTimeline?: TimelineFeature;
  }
}

/** Plug-in point (docs/CONTRACTS.md section 11). Returns the disposer. */
export function installTimeline(game: Game): () => void {
  const host = sceneManagerHost(game.scenes, createTitleScene);
  const rtl = game.i18n.dir === 'rtl';
  const reducedMotion = (): boolean => game.settings.value.accessibility.reducedMotion;
  const common = { t: game.i18n.t, rtl, reducedMotion };

  const feature: TimelineFeature = {
    createTimeline: (o) =>
      new TimelineScreen({
        ...common,
        getCompletedChapters: () => game.getState().completedChapters,
        onSelect: o.onSelect,
        ...(o.onBack ? { onBack: o.onBack } : {}),
        ...(o.embedded ? { embedded: true } : {}),
      }),
    createMap: (o) => new LivingMapScreen({ ...common, host, ...(o?.onBack ? { onBack: o.onBack } : {}) }),
    openLinked(root, o) {
      const timeline = feature.createTimeline({ ...o, embedded: true });
      const map = feature.createMap(o.onBack ? { onBack: o.onBack } : {});
      const close = hostTimelineWithMap(game, timeline, map, root);
      return { timeline, map, close };
    },
  };

  if (import.meta.env.VITE_TEST_HOOKS === '1') window.__netivimTimeline = feature;
  return () => {
    if (window.__netivimTimeline === feature) delete window.__netivimTimeline;
  };
}
