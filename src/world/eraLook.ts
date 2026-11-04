import * as THREE from 'three';
import { rgb, type RGB } from './color';

/** Eras with a distinct visual grade. Scenes pick one; the kit uses it for palettes too. */
export type EraId = 'ottoman1890' | 'mandate1940' | 'war1948' | 'austerity1950' | 'sixday1967' | 'modern' | 'archiveNight';

export const ERA_IDS: readonly EraId[] = ['ottoman1890', 'mandate1940', 'war1948', 'austerity1950', 'sixday1967', 'modern', 'archiveNight'];

/** Data only: sky gradient, sun, fog and palette tint for one era. Colors are sRGB hex. */
export interface EraLook {
  readonly id: EraId;
  /** Locale key of the era name (src/locales/he/world.json). */
  readonly nameKey: string;
  readonly skyTop: string;
  readonly skyHorizon: string;
  readonly skyBottom: string;
  /** Degrees above the horizon and compass bearing (0 = -z, 90 = +x). */
  readonly sunElevation: number;
  readonly sunAzimuth: number;
  readonly sunColor: string;
  readonly sunIntensity: number;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly hemiIntensity: number;
  readonly fogColor: string;
  /** Fog distances in meters at renderDistance 1. */
  readonly fogNear: number;
  readonly fogFar: number;
  /** Multiplier applied to terrain and kit colors (sRGB hex, white = none). */
  readonly tint: string;
  /** 1 = unchanged, < 1 washes colors toward grey (old photographs). */
  readonly saturation: number;
}

export const ERA_LOOKS: Readonly<Record<EraId, EraLook>> = {
  ottoman1890: {
    id: 'ottoman1890', nameKey: 'world.era.ottoman1890',
    skyTop: '#6e9cc9', skyHorizon: '#f3d8aa', skyBottom: '#c9a77c',
    sunElevation: 28, sunAzimuth: 235, sunColor: '#ffd59a', sunIntensity: 2.6,
    hemiSky: '#f3dcb6', hemiGround: '#6b5238', hemiIntensity: 1.25,
    fogColor: '#e8cfa2', fogNear: 90, fogFar: 320, tint: '#fff0d6', saturation: 0.88,
  },
  mandate1940: {
    id: 'mandate1940', nameKey: 'world.era.mandate1940',
    skyTop: '#6f9cc4', skyHorizon: '#e8dcc0', skyBottom: '#b7a07e',
    sunElevation: 42, sunAzimuth: 210, sunColor: '#fff0cf', sunIntensity: 2.9,
    hemiSky: '#e6e0cc', hemiGround: '#5d4a36', hemiIntensity: 1.2,
    fogColor: '#dfd2b4', fogNear: 110, fogFar: 360, tint: '#fbf3e2', saturation: 0.9,
  },
  war1948: {
    id: 'war1948', nameKey: 'world.era.war1948',
    skyTop: '#6d8fb0', skyHorizon: '#e4cfa8', skyBottom: '#a88f6c',
    sunElevation: 22, sunAzimuth: 250, sunColor: '#ffcf8e', sunIntensity: 2.7,
    hemiSky: '#e3d2b2', hemiGround: '#4e3e2e', hemiIntensity: 1.1,
    fogColor: '#d8c3a0', fogNear: 80, fogFar: 300, tint: '#f6e9d2', saturation: 0.74,
  },
  austerity1950: {
    id: 'austerity1950', nameKey: 'world.era.austerity1950',
    skyTop: '#8a9fb2', skyHorizon: '#d9d6cc', skyBottom: '#9a917f',
    sunElevation: 30, sunAzimuth: 200, sunColor: '#f6ecd8', sunIntensity: 2.2,
    hemiSky: '#d6d6d0', hemiGround: '#55504a', hemiIntensity: 1.3,
    fogColor: '#cfcdc4', fogNear: 70, fogFar: 260, tint: '#eef0f0', saturation: 0.7,
  },
  sixday1967: {
    id: 'sixday1967', nameKey: 'world.era.sixday1967',
    skyTop: '#4f8fd0', skyHorizon: '#f2e6c8', skyBottom: '#c2a57c',
    sunElevation: 55, sunAzimuth: 180, sunColor: '#fff4dc', sunIntensity: 3.2,
    hemiSky: '#e9eef2', hemiGround: '#6a5540', hemiIntensity: 1.15,
    fogColor: '#e8dcc2', fogNear: 130, fogFar: 420, tint: '#fff8ea', saturation: 0.95,
  },
  modern: {
    id: 'modern', nameKey: 'world.era.modern',
    skyTop: '#3f86d6', skyHorizon: '#dbe9f2', skyBottom: '#b9ad97',
    sunElevation: 48, sunAzimuth: 160, sunColor: '#ffffff', sunIntensity: 3.3,
    hemiSky: '#e4f0fa', hemiGround: '#5f5446', hemiIntensity: 1.2,
    fogColor: '#d6e3ea', fogNear: 150, fogFar: 480, tint: '#ffffff', saturation: 1,
  },
  archiveNight: {
    id: 'archiveNight', nameKey: 'world.era.archiveNight',
    skyTop: '#05070f', skyHorizon: '#1d2a4a', skyBottom: '#0c0f18',
    sunElevation: 35, sunAzimuth: 20, sunColor: '#9fb6ff', sunIntensity: 0.35,
    hemiSky: '#2a3658', hemiGround: '#1a120c', hemiIntensity: 0.35,
    fogColor: '#0d1220', fogNear: 30, fogFar: 140, tint: '#ffffff', saturation: 1,
  },
};

/** Era grading parameters in linear space, for terrain and kit color generation. */
export interface EraGrade {
  readonly tint: RGB;
  readonly saturation: number;
}

export function eraGrade(era: EraId): EraGrade {
  const look = ERA_LOOKS[era];
  return { tint: rgb(look.tint), saturation: look.saturation };
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.55)) : mix(uHorizon, uBottom, pow(-h, 0.4));
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 600.0 / uSunSize) * 2.0 + pow(s, 12.0) * 0.18);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** A gradient sky dome with a sun or moon glow. Follows the camera via update(). */
export class SkyDome {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunSize: { value: 1 },
  };

  constructor(radius = 900) {
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 12), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.matrixAutoUpdate = false;
  }

  set(look: EraLook, sunDir: THREE.Vector3, sunSize = 1): void {
    this.uniforms.uTop.value.set(look.skyTop);
    this.uniforms.uHorizon.value.set(look.skyHorizon);
    this.uniforms.uBottom.value.set(look.skyBottom);
    this.uniforms.uSunColor.value.set(look.sunColor);
    this.uniforms.uSunDir.value.copy(sunDir).normalize();
    this.uniforms.uSunSize.value = sunSize;
  }

  /** Keeps the dome centered on the camera (no allocation). */
  update(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
    this.mesh.updateMatrix();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** The lights and sky that an era look drives. Any field may be omitted. */
export interface LookRig {
  readonly scene: THREE.Scene;
  readonly sun?: THREE.DirectionalLight;
  readonly hemi?: THREE.HemisphereLight;
  readonly sky?: SkyDome;
  /** Distance of the sun light from its target (shadow camera placement). */
  readonly sunDistance?: number;
  /** Multiplies fog distances (settings renderDistance). */
  readonly renderDistance?: number;
  /** When false the scene gets no fog. */
  readonly fog?: boolean;
}

/** Unit vector toward the sun for a look. */
export function sunDirection(look: EraLook, out: THREE.Vector3): THREE.Vector3 {
  const el = THREE.MathUtils.degToRad(look.sunElevation);
  const az = THREE.MathUtils.degToRad(look.sunAzimuth);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/** Applies an era look to a scene: background, fog, sun, hemisphere and sky dome. */
export function applyEraLook(rig: LookRig, era: EraId): EraLook {
  const look = ERA_LOOKS[era];
  const dir = sunDirection(look, new THREE.Vector3());
  const scene = rig.scene;
  if (scene.background instanceof THREE.Color) scene.background.set(look.fogColor);
  else scene.background = new THREE.Color(look.fogColor);
  const k = rig.renderDistance ?? 1;
  if (rig.fog === false) {
    scene.fog = null;
  } else if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.set(look.fogColor);
    scene.fog.near = look.fogNear * k;
    scene.fog.far = look.fogFar * k;
  } else {
    scene.fog = new THREE.Fog(look.fogColor, look.fogNear * k, look.fogFar * k);
  }
  if (rig.sun) {
    rig.sun.color.set(look.sunColor);
    rig.sun.intensity = look.sunIntensity;
    const dist = rig.sunDistance ?? 150;
    rig.sun.position.copy(rig.sun.target.position).addScaledVector(dir, dist);
  }
  if (rig.hemi) {
    rig.hemi.color.set(look.hemiSky);
    rig.hemi.groundColor.set(look.hemiGround);
    rig.hemi.intensity = look.hemiIntensity;
  }
  rig.sky?.set(look, dir);
  return look;
}
