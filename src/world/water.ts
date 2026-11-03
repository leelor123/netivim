import * as THREE from 'three';

/**
 * A flat-shaded water sheet with gentle vertex waves computed on the GPU (no per-frame CPU work
 * besides one uniform). Faceted highlights come from flatShading on the displaced surface.
 */
export class WaterSurface {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly time = { value: 0 };

  constructor(width: number, depth: number, level: number, color: string, segments = 48) {
    const geometry = new THREE.PlaneGeometry(width, depth, segments, Math.max(1, Math.round((segments * depth) / width)));
    geometry.rotateX(-Math.PI / 2);
    geometry.deleteAttribute('uv');
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.05, flatShading: true });
    const time = this.time;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        transformed.y += sin(wp.x * 0.11 + uTime * 0.9) * 0.18 + cos(wp.z * 0.13 - uTime * 0.7) * 0.15;`,
      );
    };
    material.customProgramCacheKey = () => 'netivim-water';
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.y = level;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  update(elapsed: number): void {
    this.time.value = elapsed;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
