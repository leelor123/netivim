import type * as THREE from 'three';

interface Disposable {
  dispose(): void;
}

/**
 * Tracks everything a scene creates so dispose() frees it all exactly once, including resources
 * not attached to the graph at that moment (LOD fade materials, hidden levels).
 */
export class ResourceBag {
  private readonly items = new Set<Disposable>();
  private disposed = false;

  track<T extends Disposable>(item: T): T {
    if (this.disposed) throw new Error('ResourceBag already disposed');
    this.items.add(item);
    return item;
  }

  geometry<T extends THREE.BufferGeometry>(g: T): T {
    return this.track(g);
  }

  material<T extends THREE.Material>(m: T): T {
    return this.track(m);
  }

  get size(): number {
    return this.items.size;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.items) item.dispose();
    this.items.clear();
  }
}
