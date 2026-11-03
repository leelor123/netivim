import * as THREE from 'three';

/** Shared materials for every kit geometry (colors live in vertex colors). */
export interface KitMaterials {
  /** Opaque lit surfaces. */
  readonly solid: THREE.MeshStandardMaterial;
  /** Unlit emissive surfaces (lit windows, lamp bulbs); colors above 1 feed bloom. */
  readonly glow: THREE.MeshBasicMaterial;
  /** Like solid, plus a moonlight rim and a little self-lit fill so dark forms stay readable at night. */
  readonly lift: THREE.MeshStandardMaterial;
  /** Glossy dark glass. */
  readonly glass: THREE.MeshStandardMaterial;
  dispose(): void;
}

/** Cold moonlight tone for the night rim. */
export const NIGHT_RIM_COLOR = '#8fa8e0';

/** Rim and fill strengths for night looks (0 = off). Subtle: shapes read, colors stay dark. */
export const NIGHT_LIFT = { rim: 0.55, fill: 0.22 } as const;

export interface LiftUniforms {
  readonly rim: { value: number };
  readonly fill: { value: number };
  readonly color: { value: THREE.Color };
}

export function createLiftUniforms(rim: number = NIGHT_LIFT.rim, fill: number = NIGHT_LIFT.fill): LiftUniforms {
  return { rim: { value: rim }, fill: { value: fill }, color: { value: new THREE.Color(NIGHT_RIM_COLOR) } };
}

/**
 * Patches a MeshStandardMaterial fragment shader with a view-dependent rim light and an albedo
 * fill, both added as emissive radiance. Call from onBeforeCompile; the strengths are uniforms,
 * so one program serves day (0) and night looks.
 */
export function injectLift(shader: { uniforms: Record<string, { value: unknown }>; fragmentShader: string }, u: LiftUniforms): void {
  shader.uniforms.uLiftRim = u.rim;
  shader.uniforms.uLiftFill = u.fill;
  shader.uniforms.uLiftColor = u.color;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform float uLiftRim;
uniform float uLiftFill;
uniform vec3 uLiftColor;`)
    .replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float liftRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
      totalEmissiveRadiance += uLiftColor * (uLiftRim * liftRim) + diffuseColor.rgb * uLiftFill;`,
    );
}

export function createKitMaterials(): KitMaterials {
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  solid.name = 'kit-solid';
  const lift = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  lift.name = 'kit-lift';
  const liftUniforms = createLiftUniforms();
  lift.onBeforeCompile = (shader) => injectLift(shader, liftUniforms);
  lift.customProgramCacheKey = () => 'netivim-kit-lift';
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  glow.name = 'kit-glow';
  const glass = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.2 });
  glass.name = 'kit-glass';
  return {
    solid,
    lift,
    glow,
    glass,
    dispose() {
      solid.dispose();
      lift.dispose();
      glow.dispose();
      glass.dispose();
    },
  };
}
