import type * as THREE from 'three';
import { getRenderPipeline, WARMUP_TIMEOUT_MS } from './renderPipeline';

/** What the veil needs from the game (Game satisfies it). */
export interface VeilHost {
  readonly renderer: THREE.WebGLRenderer;
  onFrame(fn: (dt: number, paused: boolean) => void): () => void;
}

/**
 * Calls `done` once `scene` is warmed and drawn by the render pipeline (shader warm-up finished or
 * capped). Checked every frame; without a pipeline (headless tools) it fires on the next frame,
 * and a wall-clock fallback (twice the warm-up cap) guarantees it fires even if the scene is never
 * rendered (context lost). Returns a cancel function; `done` runs at most once.
 */
export function whenSceneDrawn(host: VeilHost, scene: THREE.Scene, done: () => void, clock: () => number = () => performance.now()): () => void {
  const start = clock();
  let off: (() => void) | null = null;
  const finish = (): void => {
    off?.();
    off = null;
  };
  off = host.onFrame(() => {
    const pipeline = getRenderPipeline(host.renderer);
    if (!pipeline || pipeline.sceneReady(scene) || clock() - start > WARMUP_TIMEOUT_MS * 2) {
      finish();
      done();
    }
  });
  return finish;
}
