import * as THREE from 'three';

/** A self-contained 3D scene (title, hub, a mission level). */
export interface GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update(dt: number, elapsed: number): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

/** Frees GPU memory for everything in a scene graph (geometries, materials, textures). */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
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

  get active(): GameScene | null {
    return this.current;
  }

  switchTo(next: GameScene): void {
    if (this.current === next) return;
    this.current?.dispose();
    this.current = next;
    next.resize(this.width, this.height);
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
