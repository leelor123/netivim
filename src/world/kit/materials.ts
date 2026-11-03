import * as THREE from 'three';

/** Shared materials for every kit geometry (colors live in vertex colors). */
export interface KitMaterials {
  /** Opaque lit surfaces. */
  readonly solid: THREE.MeshStandardMaterial;
  /** Unlit emissive surfaces (lit windows, lamp bulbs); colors above 1 feed bloom. */
  readonly glow: THREE.MeshBasicMaterial;
  /** Glossy dark glass. */
  readonly glass: THREE.MeshStandardMaterial;
  dispose(): void;
}

export function createKitMaterials(): KitMaterials {
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  solid.name = 'kit-solid';
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  glow.name = 'kit-glow';
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.2 });
  glass.name = 'kit-glass';
  return {
    solid,
    glow,
    glass,
    dispose() {
      solid.dispose();
      glow.dispose();
      glass.dispose();
    },
  };
}
