import * as THREE from 'three';
import type { EraId } from '../eraLook';
import { Rng } from '../rng';
import { kitBuilder } from './buildings';
import { createLiftUniforms, injectLift, type LiftUniforms } from './materials';

/**
 * Stylized civilian figures: simple, dignified, color-coded clothing per era. Each figure is one
 * merged geometry whose vertices carry a limb id (aLimb). A vertex-shader rig swings legs and arms
 * around hip and shoulder pivots, so a whole crowd (idle and walking) is one instanced draw call.
 */

export const LIMB = { body: 0, leftLeg: 1, rightLeg: 2, leftArm: 3, rightArm: 4 } as const;
export const HIP_HEIGHT = 0.9;
export const SHOULDER_HEIGHT = 1.42;

interface Outfit {
  readonly top: string;
  readonly bottom: string;
  /** Long garment (robe, dress, skirt) instead of trousers. */
  readonly long: boolean;
  readonly hat: 'none' | 'tembel' | 'fez' | 'scarf' | 'cap' | 'kerchief';
  readonly hatColor: string;
}

/** Era wardrobes: four variants each (men and women, work and town clothes). */
export const ERA_OUTFITS: Readonly<Record<EraId, readonly Outfit[]>> = {
  ottoman1890: [
    { top: '#e8e2d2', bottom: '#e8e2d2', long: true, hat: 'fez', hatColor: '#a3322a' },
    { top: '#3b3f52', bottom: '#2f3242', long: true, hat: 'scarf', hatColor: '#efe9dc' },
    { top: '#6b5a44', bottom: '#4a4038', long: false, hat: 'cap', hatColor: '#3a332c' },
    { top: '#c9b48d', bottom: '#8a7350', long: true, hat: 'kerchief', hatColor: '#e9e4d8' },
  ],
  mandate1940: [
    { top: '#d8c9a2', bottom: '#b49c6c', long: false, hat: 'tembel', hatColor: '#e6dcc0' },
    { top: '#5d7fa3', bottom: '#3d4a5c', long: false, hat: 'none', hatColor: '#000000' },
    { top: '#e9e3d4', bottom: '#4f5a73', long: true, hat: 'kerchief', hatColor: '#c0563f' },
    { top: '#efe9dc', bottom: '#2f3242', long: true, hat: 'fez', hatColor: '#9c2f28' },
  ],
  war1948: [
    { top: '#bfae84', bottom: '#9c8a62', long: false, hat: 'tembel', hatColor: '#d8cdb0' },
    { top: '#4f6b8a', bottom: '#3d4352', long: false, hat: 'cap', hatColor: '#3b3a36' },
    { top: '#d7cfbd', bottom: '#5a5446', long: true, hat: 'kerchief', hatColor: '#6f8aa6' },
    { top: '#8a7b5f', bottom: '#6a5c44', long: false, hat: 'none', hatColor: '#000000' },
  ],
  austerity1950: [
    { top: '#7c7a74', bottom: '#4b4a46', long: false, hat: 'cap', hatColor: '#3b3a36' },
    { top: '#9a8f7a', bottom: '#5c5548', long: true, hat: 'scarf', hatColor: '#c7bfae' },
    { top: '#d6d0c2', bottom: '#5b6470', long: false, hat: 'tembel', hatColor: '#d6ccb0' },
    { top: '#6f5d4f', bottom: '#463c34', long: true, hat: 'kerchief', hatColor: '#8a6c5a' },
  ],
  sixday1967: [
    { top: '#f0ece2', bottom: '#4a5466', long: false, hat: 'none', hatColor: '#000000' },
    { top: '#b8a77c', bottom: '#8f7f58', long: false, hat: 'tembel', hatColor: '#d8cdb0' },
    { top: '#d98c5f', bottom: '#3f4d6b', long: true, hat: 'none', hatColor: '#000000' },
    { top: '#6f9ab8', bottom: '#e9e4d8', long: true, hat: 'kerchief', hatColor: '#f1d27a' },
  ],
  modern: [
    { top: '#2f6fb2', bottom: '#2c3a52', long: false, hat: 'none', hatColor: '#000000' },
    { top: '#e86a4a', bottom: '#3b3f48', long: false, hat: 'cap', hatColor: '#1f2a3a' },
    { top: '#f2efe8', bottom: '#6b7f9a', long: true, hat: 'none', hatColor: '#000000' },
    { top: '#4f9a72', bottom: '#d9d3c5', long: false, hat: 'none', hatColor: '#000000' },
  ],
  archiveNight: [
    { top: '#3c4a63', bottom: '#2a2f3a', long: false, hat: 'none', hatColor: '#000000' },
    { top: '#8a5a48', bottom: '#2e2a28', long: true, hat: 'none', hatColor: '#000000' },
    { top: '#e2ddd0', bottom: '#40444c', long: false, hat: 'none', hatColor: '#000000' },
    { top: '#5f6f55', bottom: '#33302c', long: false, hat: 'none', hatColor: '#000000' },
  ],
};

const SKIN = ['#e3b896', '#c99772', '#a8754f', '#8a5c3d', '#f0c9a8'];
const HAIR = ['#2a2420', '#4a3426', '#6b4a2e', '#8a8580', '#1d1a18'];

/** One civilian figure (about 1.75 m, facing +z) with aLimb for the procedural rig. */
export function figureGeometry(o: { era?: EraId; variant?: number; seed?: number | string } = {}): THREE.BufferGeometry {
  const era = o.era ?? 'modern';
  const outfits = ERA_OUTFITS[era];
  const outfit = outfits[(o.variant ?? 0) % outfits.length] ?? outfits[0];
  if (!outfit) throw new Error('no outfit');
  const r = new Rng(o.seed ?? 'figure-' + era + String(o.variant ?? 0));
  const skin = r.pick(SKIN);
  const hair = r.pick(HAIR);
  const b = kitBuilder({ era, seed: o.seed ?? 1 }, 0.06, true);
  const shoe = '#3a2e26';

  b.limb = LIMB.leftLeg;
  b.box(0.15, 0.82, 0.17, outfit.bottom, 0.1, 0.49, 0);
  b.box(0.16, 0.09, 0.26, shoe, 0.1, 0.045, 0.04);
  b.limb = LIMB.rightLeg;
  b.box(0.15, 0.82, 0.17, outfit.bottom, -0.1, 0.49, 0);
  b.box(0.16, 0.09, 0.26, shoe, -0.1, 0.045, 0.04);

  b.limb = LIMB.body;
  b.box(0.42, 0.6, 0.24, outfit.top, 0, 1.18, 0);
  if (outfit.long) b.cone(0.36, 0.75, 7, outfit.bottom, 0, 0.62, 0, Math.PI);
  b.box(0.12, 0.08, 0.12, skin, 0, 1.52, 0);
  b.blob(0.13, skin, 0, 1.66, 0.01, 1, 1.15, 1);
  switch (outfit.hat) {
    case 'tembel':
      b.cone(0.15, 0.2, 6, outfit.hatColor, 0, 1.83, 0);
      break;
    case 'fez':
      b.cyl(0.09, 0.11, 0.16, 7, outfit.hatColor, 0, 1.82, 0);
      break;
    case 'scarf':
      b.blob(0.16, outfit.hatColor, 0, 1.69, -0.03, 1, 1.15, 1.05);
      b.box(0.3, 0.35, 0.05, outfit.hatColor, 0, 1.5, -0.12);
      break;
    case 'cap':
      b.cyl(0.14, 0.14, 0.07, 7, outfit.hatColor, 0, 1.79, 0);
      b.box(0.18, 0.02, 0.1, outfit.hatColor, 0, 1.76, 0.14);
      break;
    case 'kerchief':
      b.blob(0.145, outfit.hatColor, 0, 1.72, -0.02, 1, 0.8, 1.05);
      break;
    case 'none':
      b.blob(0.135, hair, 0, 1.72, -0.02, 1, 0.75, 1.05);
      break;
  }

  b.limb = LIMB.leftArm;
  b.box(0.11, 0.56, 0.13, outfit.top, 0.27, 1.13, 0);
  b.box(0.09, 0.1, 0.1, skin, 0.27, 0.8, 0);
  b.limb = LIMB.rightArm;
  b.box(0.11, 0.56, 0.13, outfit.top, -0.27, 1.13, 0);
  b.box(0.09, 0.1, 0.1, skin, -0.27, 0.8, 0);
  return b.build();
}

/** Material for figures: shared shader rig driven by one time uniform. */
export class FigureMaterial {
  readonly material: THREE.MeshStandardMaterial;
  readonly time = { value: 0 };

  /** Moonlight rim and fill; strengths are zero outside night looks. */
  readonly lift: LiftUniforms;

  /** `era` archiveNight (night and moonlight scenes) turns on the rim and fill that keep figures readable. */
  constructor(era?: EraId) {
    const night = era === 'archiveNight';
    this.lift = night ? createLiftUniforms() : createLiftUniforms(0, 0);
    const lift = this.lift;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
    this.material.name = 'figure-rig';
    const time = this.time;
    this.material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute float aLimb;
          attribute vec2 aGait;
          uniform float uTime;`,
        )
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
          float gWalk = aGait.y;
          float gPhase = uTime * mix(1.4, 7.5, gWalk) + aGait.x;
          float gSwing = sin(gPhase);
          float limbAngle = 0.0;
          float limbPivot = 0.0;
          if (aLimb > 0.5 && aLimb < 2.5) {
            limbPivot = ${HIP_HEIGHT.toFixed(2)};
            limbAngle = (aLimb < 1.5 ? 1.0 : -1.0) * gSwing * 0.55 * gWalk;
          } else if (aLimb > 2.5) {
            limbPivot = ${SHOULDER_HEIGHT.toFixed(2)};
            limbAngle = (aLimb < 3.5 ? -1.0 : 1.0) * gSwing * mix(0.07, 0.45, gWalk);
          }
          float lc = cos(limbAngle);
          float ls = sin(limbAngle);
          mat3 limbRot = mat3(1.0, 0.0, 0.0, 0.0, lc, ls, 0.0, -ls, lc);
          objectNormal = limbRot * objectNormal;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed.y -= limbPivot;
          transformed = limbRot * transformed;
          transformed.y += limbPivot;
          transformed.y += gWalk * abs(cos(gPhase)) * 0.045 + (1.0 - gWalk) * sin(uTime * 1.2 + aGait.x) * 0.006 * step(0.9, transformed.y);`,
        );
      if (night) injectLift(shader, lift);
    };
    this.material.customProgramCacheKey = () => (night ? 'netivim-figure-rig-lift' : 'netivim-figure-rig');
  }

  update(elapsed: number): void {
    this.time.value = elapsed;
  }

  dispose(): void {
    this.material.dispose();
  }
}

/** Instanced crowd of one figure geometry; per-instance gait (phase, walk 0-1). */
export class Crowd {
  readonly mesh: THREE.InstancedMesh;
  readonly gait: THREE.InstancedBufferAttribute;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);

  constructor(geometry: THREE.BufferGeometry, material: FigureMaterial, count: number) {
    this.gait = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 2), 2);
    geometry.setAttribute('aGait', this.gait);
    this.mesh = new THREE.InstancedMesh(geometry, material.material, Math.max(1, count));
    this.mesh.count = count;
    this.mesh.castShadow = true;
    this.mesh.name = 'crowd';
  }

  /** Places one figure. No allocation; call setDirty() after a batch of changes. */
  set(i: number, x: number, y: number, z: number, heading: number, walk: number, phase: number, scale = 1): void {
    this.p.set(x, y, z);
    this.q.setFromAxisAngle(this.up, heading);
    this.s.setScalar(scale);
    this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    this.gait.setXY(i, phase, walk);
  }

  setDirty(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.gait.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  /** Only moves instances (no bounding-sphere rebuild): for per-frame walkers. */
  markMoved(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
