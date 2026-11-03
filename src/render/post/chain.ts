import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import type { PipelineConfig } from '../pipelineConfig';
import type { EraGrade } from '../eras';
import { createGradeShader, createLightShaftsShader, createMotionBlurShader } from './shaders';

/**
 * Lazy-loaded post-processing chain (its own chunk: low presets never download it).
 *
 * Order: scene (MSAA, optional depth texture) -> GTAO -> depth of field -> motion blur ->
 * light shafts -> bloom -> SMAA (linear) -> OutputPass (AgX + sRGB) -> FXAA (sRGB) -> grade+dither.
 */

/** The scene render; remembers which composer buffer (and depth texture) it wrote this frame. */
class ScenePass extends RenderPass {
  depth: THREE.DepthTexture | null = null;
  /** Uniforms of later passes that sample this frame's scene depth. */
  readonly depthUniforms: THREE.IUniform[] = [];

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    this.depth = readBuffer.depthTexture;
    for (let i = 0; i < this.depthUniforms.length; i++) {
      const du = this.depthUniforms[i];
      if (du) du.value = this.depth;
    }
  }
}

type Uniforms = Record<string, THREE.IUniform>;

/** Looks up a uniform that the shader definition is known to declare. */
function uniform(uniforms: Uniforms, name: string): THREE.IUniform {
  const found = uniforms[name];
  if (!found) throw new Error('missing uniform ' + name);
  return found;
}

interface GtaoInternals {
  normalRenderTarget: THREE.WebGLRenderTarget;
}

/**
 * GTAO that reads the depth the scene pass already produced instead of re-rendering the whole
 * scene with a normal material (half the draw calls). Normals are reconstructed from depth, which
 * is exact for flat-shaded low-poly faces.
 */
class SharedDepthGTAOPass extends GTAOPass {
  constructor(scene: THREE.Scene, camera: THREE.Camera, private readonly source: ScenePass, placeholder: THREE.DepthTexture) {
    super(scene, camera, 1, 1);
    // The base constructor allocated its own G-buffer target; keep it at 1x1 (unused).
    this.setGBuffer(placeholder);
    (this as unknown as GtaoInternals).normalRenderTarget.setSize(1, 1);
  }

  override setSize(width: number, height: number): void {
    super.setSize(width, height);
    (this as unknown as GtaoInternals).normalRenderTarget.setSize(1, 1);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const depth = this.source.depth;
    if (depth) {
      uniform(this.gtaoMaterial.uniforms, 'tDepth').value = depth;
      uniform(this.pdMaterial.uniforms, 'tDepth').value = depth;
    }
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
  }

  override dispose(): void {
    super.dispose();
    (this as unknown as GtaoInternals).normalRenderTarget.dispose();
  }
}

export interface DofParams {
  focusDistance: number;
  aperture: number;
  maxBlur: number;
}

export class PostChain {
  readonly composer: EffectComposer;
  private readonly scenePass: ScenePass;
  private readonly bokeh: BokehPass | null = null;
  private readonly motion: ShaderPass | null = null;
  private readonly shafts: ShaderPass | null = null;
  private readonly bloom: UnrealBloomPass | null = null;
  private readonly grade: ShaderPass | null = null;
  private readonly fxaa: FXAAPass | null = null;
  private readonly placeholderDepth: THREE.DepthTexture | null = null;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly prevViewProjection = new THREE.Matrix4();
  private hasPrev = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    config: PipelineConfig,
    cssWidth: number,
    cssHeight: number,
  ) {
    this.camera = camera;
    const needDepth = config.ambientOcclusion || config.motionBlur;
    const target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: config.msaaSamples,
      depthTexture: needDepth ? new THREE.DepthTexture(1, 1) : null,
    });
    target.texture.name = 'Netivim.post';
    this.composer = new EffectComposer(renderer, target);
    this.composer.setPixelRatio(renderer.getPixelRatio());

    this.scenePass = new ScenePass(scene, camera);
    this.composer.addPass(this.scenePass);

    if (config.ambientOcclusion) {
      this.placeholderDepth = new THREE.DepthTexture(1, 1);
      const gtao = new SharedDepthGTAOPass(scene, camera, this.scenePass, this.placeholderDepth);
      // World-space radius sized for human-scale low-poly props; 12 samples is the mobile sweet spot.
      gtao.updateGtaoMaterial({ radius: 1.6, thickness: 1.2, scale: 1, samples: 12 });
      gtao.updatePdMaterial({ radius: 6, rings: 2, samples: 12 });
      gtao.blendIntensity = 0.85;
      this.composer.addPass(gtao);
    }

    if (config.depthOfField) {
      this.bokeh = new BokehPass(scene, camera, { focus: 10, aperture: 0.02, maxblur: 0.008 });
      this.bokeh.enabled = false;
      this.composer.addPass(this.bokeh);
    }

    if (config.motionBlur) {
      this.motion = new ShaderPass(createMotionBlurShader());
      this.scenePass.depthUniforms.push(uniform(this.motion.uniforms, 'tDepth'));
      this.composer.addPass(this.motion);
    }

    if (config.lightShafts) {
      this.shafts = new ShaderPass(createLightShaftsShader());
      this.composer.addPass(this.shafts);
    }

    if (config.bloom) {
      // Subtle and threshold-based: only HDR highlights (sun, sky glow, emissives) bloom.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(cssWidth, cssHeight), 0.22, 0.5, 1.2);
      this.composer.addPass(this.bloom);
    }

    if (config.smaa) this.composer.addPass(new SMAAPass());
    this.composer.addPass(new OutputPass());
    if (config.fxaa) {
      this.fxaa = new FXAAPass();
      this.composer.addPass(this.fxaa);
    }
    if (config.grading) {
      this.grade = new ShaderPass(createGradeShader());
      if (!config.dither) {
        this.grade.material.defines.DITHER = 0;
        this.grade.material.needsUpdate = true;
      }
      this.composer.addPass(this.grade);
    }
    this.setSize(cssWidth, cssHeight);
  }

  setSize(cssWidth: number, cssHeight: number): void {
    this.composer.setSize(cssWidth, cssHeight);
    const aspect = cssWidth / Math.max(1, cssHeight);
    if (this.grade) uniform(this.grade.uniforms, 'aspect').value = aspect;
    if (this.shafts) uniform(this.shafts.uniforms, 'aspect').value = aspect;
    if (this.bokeh) uniform(this.bokeh.uniforms as Uniforms, 'aspect').value = aspect;
  }

  setPixelRatio(pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
  }

  setGrade(g: EraGrade): void {
    if (!this.grade) return;
    const u = this.grade.uniforms;
    (uniform(u, 'lift').value as THREE.Vector3).set(g.lift[0], g.lift[1], g.lift[2]);
    (uniform(u, 'gammaRgb').value as THREE.Vector3).set(g.gamma[0], g.gamma[1], g.gamma[2]);
    (uniform(u, 'gain').value as THREE.Vector3).set(g.gain[0], g.gain[1], g.gain[2]);
    uniform(u, 'saturation').value = g.saturation;
    uniform(u, 'contrast').value = g.contrast;
    uniform(u, 'vignette').value = g.vignette;
  }

  /** Sun position in screen UV and shaft strength (0 when the sun is behind the camera). */
  setSun(u: number, v: number, strength: number): void {
    if (!this.shafts) return;
    (uniform(this.shafts.uniforms, 'sunUv').value as THREE.Vector2).set(u, v);
    uniform(this.shafts.uniforms, 'intensity').value = strength;
  }

  /** null switches depth of field off. */
  setDepthOfField(p: DofParams | null): void {
    if (!this.bokeh) return;
    this.bokeh.enabled = p !== null;
    if (p) {
      const u = this.bokeh.uniforms as Record<string, THREE.IUniform>;
      uniform(u, 'focus').value = p.focusDistance;
      uniform(u, 'aperture').value = p.aperture;
      uniform(u, 'maxblur').value = p.maxBlur;
    }
  }

  get hasDepthOfField(): boolean {
    return this.bokeh !== null;
  }

  render(deltaSeconds: number): void {
    if (this.motion) {
      const u = this.motion.uniforms;
      const cam = this.camera;
      (uniform(u, 'projectionInverse').value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
      (uniform(u, 'cameraWorld').value as THREE.Matrix4).copy(cam.matrixWorld);
      if (!this.hasPrev) this.prevViewProjection.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      (uniform(u, 'previousViewProjection').value as THREE.Matrix4).copy(this.prevViewProjection);
    }
    this.composer.render(deltaSeconds);
    if (this.motion) {
      this.prevViewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
      this.hasPrev = true;
    }
  }

  dispose(): void {
    for (const pass of this.composer.passes) pass.dispose();
    this.composer.dispose();
    this.placeholderDepth?.dispose();
  }
}
