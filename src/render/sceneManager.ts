import * as THREE from 'three';
import type { GraphicsOptions, GraphicsPreset } from '../core/settings';
import type { EraId } from './eras';

/** The graphics state a scene adapts to (density, distances, fog). */
export interface SceneGraphics {
  readonly options: GraphicsOptions;
  /** The preset in effect, or null for Custom. */
  readonly preset: GraphicsPreset | null;
}

/** A self-contained 3D scene (title, hub, a mission level). */
export interface GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update(dt: number, elapsed: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
  /**
   * Optional: the key light. When present the render pipeline owns its shadow settings (map size,
   * PCF radius, bias) and fits its shadow camera to the visible area every frame.
   */
  readonly sun?: THREE.DirectionalLight;
  /** Optional: normalized direction from the scene toward the sun (light shafts, shadow fit). */
  readonly sunDirection?: THREE.Vector3;
  /** Optional: how far from the camera shadows reach at Ultra (world units). Default 80. */
  readonly shadowDistance?: number;
  /** Optional: color-grading palette (render/eras.ts). Default 'archive'. */
  readonly era?: EraId;
  /** Optional: adapt density, distances and fog to the graphics options (called on switch and on change). */
  applyGraphics?(graphics: SceneGraphics): void;
  /**
   * Optional: rebuild GPU-only state the scene created itself (e.g. data textures, render
   * targets) after a WebGL context loss. three.js re-uploads geometries/materials/textures.
   */
  onContextRestored?(): void;
}

/** Frees GPU memory for everything in a scene graph (geometries, materials, textures). */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    // Lights own shadow-map render targets; dispose() frees them.
    if (obj instanceof THREE.Light) obj.dispose();
    const mesh = obj as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
      m.dispose();
    }
  });
}

/** Holds the active scene; switching disposes the previous one so memory stays flat. */
export class SceneManager {
  private current: GameScene | null = null;
  private width = 1;
  private height = 1;
  private graphics: SceneGraphics | null = null;

  get active(): GameScene | null {
    return this.current;
  }

  switchTo(next: GameScene): void {
    if (this.current === next) return;
    this.current?.dispose();
    this.current = next;
    next.resize(this.width, this.height);
    if (this.graphics) next.applyGraphics?.(this.graphics);
  }

  /** Graphics options changed (live settings, adaptive quality): the active scene adapts. */
  setGraphics(graphics: SceneGraphics): void {
    this.graphics = graphics;
    this.current?.applyGraphics?.(graphics);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.current?.resize(width, height);
  }

  update(dt: number, elapsed: number): void {
    this.current?.update(dt, elapsed);
  }

  dispose(): void {
    this.current?.dispose();
    this.current = null;
  }
}
