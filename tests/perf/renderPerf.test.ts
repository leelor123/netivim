import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { assignInstancedCasterDepth } from '../../src/render/renderPipeline';
import { Terrain } from '../../src/world/terrain';

describe('instanced shadow casters get their own depth material', () => {
  const plain = new THREE.MeshDepthMaterial();
  const colored = new THREE.MeshDepthMaterial();
  const geo = new THREE.BoxGeometry();
  const mat = new THREE.MeshStandardMaterial();

  it('assigns the plain variant to an instanced caster', () => {
    const im = new THREE.InstancedMesh(geo, mat, 2);
    im.castShadow = true;
    assignInstancedCasterDepth(im, plain, colored);
    expect(im.customDepthMaterial).toBe(plain);
  });

  it('switches to the instance-color variant once instance colors exist', () => {
    const im = new THREE.InstancedMesh(geo, mat, 2);
    im.castShadow = true;
    assignInstancedCasterDepth(im, plain, colored);
    im.setColorAt(0, new THREE.Color(1, 0, 0));
    assignInstancedCasterDepth(im, plain, colored);
    expect(im.customDepthMaterial).toBe(colored);
  });

  it('leaves plain meshes, non-casters and scene-defined depth materials alone', () => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    assignInstancedCasterDepth(mesh, plain, colored);
    expect(mesh.customDepthMaterial).toBeUndefined();
    const quiet = new THREE.InstancedMesh(geo, mat, 1);
    assignInstancedCasterDepth(quiet, plain, colored);
    expect(quiet.customDepthMaterial).toBeUndefined();
    const own = new THREE.MeshDepthMaterial();
    const custom = new THREE.InstancedMesh(geo, mat, 1);
    custom.castShadow = true;
    custom.customDepthMaterial = own;
    assignInstancedCasterDepth(custom, plain, colored);
    expect(custom.customDepthMaterial).toBe(own);
  });
});

describe('terrain LOD cross-fade program is precompiled with the scene', () => {
  it('carries one hidden, never-drawn mesh with the alpha-hash fade material', () => {
    const t = new Terrain({ seed: 'perf', size: 64, chunkSize: 32, cell: 2, biome: 'coastalPlain' });
    const carriers = t.group.children.filter((c) => c.name === 'terrain-fade-prewarm');
    expect(carriers).toHaveLength(1);
    const carrier = carriers[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(carrier.visible).toBe(false);
    expect(carrier.material.alphaHash).toBe(true);
    // Shares a chunk geometry: no extra GPU buffers.
    const lod0 = t.group.children.find((c) => c.name === 'terrain-0-0-lod0') as THREE.Mesh | undefined;
    expect(carrier.geometry).toBe(lod0?.geometry);
    // Traversed by renderer.compile() (which visits invisible objects), skipped by rendering.
    let found = false;
    t.group.traverse((o) => {
      if (o === carrier) found = true;
    });
    expect(found).toBe(true);
    t.dispose();
  });
});
