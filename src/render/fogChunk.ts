import * as THREE from 'three';

/**
 * three.js applies fog after tone mapping and the output conversion, with fogColor uploaded in
 * the output color space (sRGB on the canvas, linear in render targets). On the direct-to-canvas
 * path (presets without post) the fog therefore skips AgX while lit surfaces and the sky go
 * through it, and distant hills turn a different color than the sky behind them; through the
 * composer the same fog is tone mapped by OutputPass. This helper decodes the fog color to linear,
 * lets the caller add terms (sun glow), and applies the same tone mapping and encoding as every
 * other pixel, so fog matches the sky on every preset.
 *
 * `haze` is a GLSL expression for the linear fog color; `fogLinear` holds the decoded fogColor.
 */
export function fogMixGlsl(haze: string): string {
  return /* glsl */ `
  // linearToOutputTexel is the identity for linear targets; otherwise fogColor is sRGB-encoded.
  bool fogEncoded = linearToOutputTexel(vec4(0.5)).r != 0.5;
  vec3 fogLinear = fogEncoded ? sRGBTransferEOTF(vec4(fogColor, 1.0)).rgb : fogColor;
  vec3 fogHaze = ${haze};
  #ifdef TONE_MAPPING
    fogHaze = toneMapping(fogHaze);
  #endif
  fogHaze = linearToOutputTexel(vec4(fogHaze, 1.0)).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogHaze, fogFactor);
`;
}

const PATCHED_FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  ${fogMixGlsl('fogLinear')}
#endif
`;

let installed = false;

/** Replaces the stock fog chunk once, for every material (called by the render pipeline). */
export function installFogChunk(): void {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_fragment = PATCHED_FOG_FRAGMENT;
}
