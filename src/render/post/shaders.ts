import * as THREE from 'three';

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Interleaved gradient noise (Jimenez 2014): cheap, stable, no texture. */
const IGN = /* glsl */ `
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
`;

/**
 * Screen-space light shafts (radial blur of the bright sky toward the sun). Occluders (hills,
 * trees) are dark in the scene color, so the gaps between them stream light. Linear HDR space.
 */
export function createLightShaftsShader(): THREE.ShaderMaterialParameters & { uniforms: Record<string, THREE.IUniform> } {
  return {
    name: 'LightShaftsShader',
    defines: { SAMPLES: 28 },
    uniforms: {
      tDiffuse: { value: null },
      sunUv: { value: new THREE.Vector2(0.5, 0.5) },
      intensity: { value: 0 },
      threshold: { value: 1.0 },
      density: { value: 0.9 },
      decay: { value: 0.955 },
      tint: { value: new THREE.Color(1.0, 0.78, 0.52) },
      aspect: { value: 1 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 sunUv;
uniform float intensity;
uniform float threshold;
uniform float density;
uniform float decay;
uniform vec3 tint;
uniform float aspect;
varying vec2 vUv;
${IGN}
void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  if (intensity <= 0.0) { gl_FragColor = base; return; }
  vec2 delta = (vUv - sunUv) * (density / float(SAMPLES));
  // Per-pixel jitter of the march start hides the stepping pattern.
  vec2 uv = vUv - delta * ign(gl_FragCoord.xy);
  float w = 1.0;
  float sum = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    uv -= delta;
    vec3 s = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
    float l = max(dot(s, vec3(0.2126, 0.7152, 0.0722)) - threshold, 0.0);
    sum += min(l, 4.0) * w;
    w *= decay;
  }
  vec2 d = (vUv - sunUv) * vec2(aspect, 1.0);
  float falloff = 1.0 / (1.0 + dot(d, d) * 3.0);
  vec3 shafts = tint * (sum / float(SAMPLES)) * intensity * falloff;
  gl_FragColor = vec4(base.rgb + shafts, base.a);
}
`,
  };
}

/**
 * Camera motion blur from depth: reconstructs each pixel's world position, reprojects it with the
 * previous frame's view-projection and blurs along the screen-space velocity. Off by default.
 */
export function createMotionBlurShader(): THREE.ShaderMaterialParameters & { uniforms: Record<string, THREE.IUniform> } {
  return {
    name: 'CameraMotionBlurShader',
    defines: { SAMPLES: 8 },
    uniforms: {
      tDiffuse: { value: null },
      tDepth: { value: null },
      projectionInverse: { value: new THREE.Matrix4() },
      cameraWorld: { value: new THREE.Matrix4() },
      previousViewProjection: { value: new THREE.Matrix4() },
      strength: { value: 0.5 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform mat4 projectionInverse;
uniform mat4 cameraWorld;
uniform mat4 previousViewProjection;
uniform float strength;
varying vec2 vUv;
void main() {
  float depth = texture2D(tDepth, vUv).x;
  vec4 base = texture2D(tDiffuse, vUv);
  vec4 ndc = vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = projectionInverse * ndc;
  view /= view.w;
  vec4 world = cameraWorld * view;
  vec4 prev = previousViewProjection * world;
  vec2 prevUv = prev.xy / prev.w * 0.5 + 0.5;
  vec2 velocity = (vUv - prevUv) * strength;
  float len = length(velocity);
  if (len < 0.0005) { gl_FragColor = base; return; }
  velocity *= min(1.0, 0.04 / len);
  vec3 sum = base.rgb;
  for (int i = 1; i < SAMPLES; i++) {
    float t = float(i) / float(SAMPLES - 1) - 0.5;
    sum += texture2D(tDiffuse, clamp(vUv + velocity * t, 0.0, 1.0)).rgb;
  }
  gl_FragColor = vec4(sum / float(SAMPLES), base.a);
}
`,
  };
}

/**
 * Final display-space pass: per-era grade (lift/gamma/gain, saturation, contrast, vignette) and
 * +-0.5 LSB triangular dithering so 8-bit output shows no banding in skies and fog.
 */
export function createGradeShader(): THREE.ShaderMaterialParameters & { uniforms: Record<string, THREE.IUniform> } {
  return {
    name: 'EraGradeShader',
    defines: { DITHER: 1 },
    uniforms: {
      tDiffuse: { value: null },
      lift: { value: new THREE.Vector3(0, 0, 0) },
      gammaRgb: { value: new THREE.Vector3(1, 1, 1) },
      gain: { value: new THREE.Vector3(1, 1, 1) },
      saturation: { value: 1 },
      contrast: { value: 1 },
      vignette: { value: 0 },
      aspect: { value: 1 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec3 lift;
uniform vec3 gammaRgb;
uniform vec3 gain;
uniform float saturation;
uniform float contrast;
uniform float vignette;
uniform float aspect;
varying vec2 vUv;
${IGN}
void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  vec3 c = clamp(src.rgb, 0.0, 1.0);
  c = c * gain + lift * (1.0 - c);
  c = pow(max(c, vec3(0.0)), 1.0 / gammaRgb);
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, saturation);
  c = (c - 0.5) * contrast + 0.5;
  vec2 v = (vUv - 0.5) * vec2(aspect, 1.0);
  c *= 1.0 - vignette * smoothstep(0.35, 1.05, length(v) * 1.25);
  #if DITHER == 1
    // Triangular-PDF dither from two decorrelated IGN samples, +-1 LSB of 8-bit output.
    float n = ign(gl_FragCoord.xy) + ign(gl_FragCoord.yx + 17.0) - 1.0;
    c += n / 255.0;
  #endif
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
}
`,
  };
}
