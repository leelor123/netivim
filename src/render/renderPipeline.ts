import * as THREE from 'three';
import type { GameScene } from './sceneManager';
import type { ResolvedGraphics } from './presets';
import { chainKey, needsComposer, toPipelineConfig, type DeviceInfo, type PipelineConfig } from './pipelineConfig';
import { FrameLimiter } from './frameLimiter';
import { ShadowFitter } from './shadows';
import { DEFAULT_ERA, ERA_GRADES, type EraId } from './eras';
import { installFogChunk } from './fogChunk';
import type { DofParams, PostChain } from './post/chain';

type PostModule = typeof import('./post/chain');

/** Per-frame numbers for the debug overlay, adaptive quality and tests (mutated in place). */
export interface FrameStats {
  /** Interval between the last two rendered frames (ms). */
  frameMs: number;
  /** Smoothed frames per second. */
  fps: number;
  /** Totals for the whole frame: shadow maps, scene and every post pass. */
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  pixelRatio: number;
  /** Drawing-buffer size in device pixels. */
  width: number;
  height: number;
  /** True when the post chain runs (EffectComposer). */
  composer: boolean;
}

export type FrameListener = (frameMs: number, nowMs: number) => void;

const DEFAULT_SHADOW_DISTANCE = 80;
const SHAFT_STRENGTH = 0.6;
const SUN_FAR = 500;
/**
 * Longest a new scene waits for its shaders before it is drawn anyway (ms). On drivers with
 * KHR_parallel_shader_compile (Chrome / Android WebView) programs link off the main thread and are
 * usually ready within a few frames; meanwhile the canvas keeps showing the previous frame.
 */
export const WARMUP_TIMEOUT_MS = 2000;
/** How often the active scene is rescanned for new instanced shadow casters (ms). */
const CASTER_SCAN_MS = 1000;

const registry = new WeakMap<THREE.WebGLRenderer, RenderPipeline>();

/**
 * The pipeline that owns a renderer (Game exposes only `renderer`). Cinematics and other systems
 * use this, e.g. getRenderPipeline(game.renderer)?.setDepthOfField(8, 0.02).
 */
export function getRenderPipeline(renderer: THREE.WebGLRenderer): RenderPipeline | undefined {
  return registry.get(renderer);
}

/**
 * Gives an instanced shadow caster its own depth material (plain or instance-color variant) unless
 * the scene set a custom one. Pure scene-graph work, exported for unit tests.
 */
export function assignInstancedCasterDepth(o: THREE.Object3D, plain: THREE.Material, colored: THREE.Material): void {
  const im = o as THREE.InstancedMesh;
  if (im.isInstancedMesh !== true || !im.castShadow) return;
  const current = im.customDepthMaterial;
  if (current !== undefined && current !== plain && current !== colored) return;
  im.customDepthMaterial = im.instanceColor !== null ? colored : plain;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Owns the WebGLRenderer and everything between a scene and the screen (ADR 0006): pixel ratio,
 * FPS cap, shadows, the lazy post chain, grading, depth of field and context-loss recovery.
 * Settings apply live through apply(); nothing here needs a page reload.
 */
export class RenderPipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly limiter = new FrameLimiter(60);
  readonly stats: FrameStats = {
    frameMs: 0,
    fps: 0,
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
    pixelRatio: 1,
    width: 0,
    height: 0,
    composer: false,
  };

  private resolved_: ResolvedGraphics;
  private config_: PipelineConfig;
  private readonly device: DeviceInfo;
  private cssWidth = 1;
  private cssHeight = 1;

  private postModule: PostModule | null = null;
  private postLoading = false;
  private chain: PostChain | null = null;
  private wantedKey = '';
  private builtKey = '';
  private chainScene: THREE.Scene | null = null;
  private chainCamera: THREE.Camera | null = null;
  private gradedEra: EraId | null = null;

  private readonly dofParams: DofParams = { focusDistance: 10, aperture: 0.02, maxBlur: 0.008 };
  private dofActive = false;

  private readonly fitter = new ShadowFitter();
  private shadowSun: THREE.DirectionalLight | null = null;
  private shadowSize = -1;

  private warmScene: THREE.Scene | null = null;
  private warmPending = false;
  private warmDeadline = 0;
  /** Scene warm-ups so far (tests and the perf report). */
  warmups = 0;

  /**
   * Shadow depth materials for instanced casters. three.js draws every caster with ONE shared
   * depth material; when instanced and plain meshes both cast, that material flips its
   * instancing variant several times per frame, and each flip re-runs getProgram (parameters +
   * cache-key string: kilobytes of garbage and CPU per frame). Instanced casters get their own
   * depth material (one per instance-color variant), so the shared one never changes variant.
   */
  private readonly instancedDepth = new THREE.MeshDepthMaterial();
  private readonly instancedColorDepth = new THREE.MeshDepthMaterial();
  private lastCasterScan = -Infinity;
  private readonly assignCasterDepth = (o: THREE.Object3D): void => assignInstancedCasterDepth(o, this.instancedDepth, this.instancedColorDepth);

  private lastFrameTime = -1;
  private lost = false;
  private readonly listeners: FrameListener[] = [];
  private readonly tmpSun = new THREE.Vector3();
  private readonly tmpForward = new THREE.Vector3();
  private readonly tmpScreen = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, initial: ResolvedGraphics) {
    // antialias is off at the context level: MSAA lives on the composer's render target where it
    // can be switched live; a default-framebuffer MSAA could only change by recreating the context.
    installFogChunk();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Counters accumulate over the whole frame (shadow pass + scene + post) and reset per frame.
    this.renderer.info.autoReset = false;
    const caps = this.renderer.capabilities;
    this.device = {
      devicePixelRatio: typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      maxTextureSize: caps.maxTextureSize,
      maxSamples: caps.maxSamples,
    };
    this.resolved_ = initial;
    this.config_ = toPipelineConfig(initial.options, this.device);
    this.apply(initial);
    registry.set(this.renderer, this);
  }

  get resolved(): ResolvedGraphics {
    return this.resolved_;
  }

  get config(): PipelineConfig {
    return this.config_;
  }

  /** True once everything the current options need is loaded (the post chunk is lazy). */
  get ready(): boolean {
    if (this.warmPending) return false;
    return !needsComposer(this.config_, this.dofActive) || (this.chain !== null && this.builtKey === this.wantedKey);
  }

  get contextLost(): boolean {
    return this.lost;
  }

  /** Applies graphics options live (no reload, no new context). */
  apply(resolved: ResolvedGraphics): void {
    this.resolved_ = resolved;
    this.config_ = toPipelineConfig(resolved.options, this.device);
    const c = this.config_;
    this.renderer.setPixelRatio(c.pixelRatio);
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.limiter.setCap(c.fpsCap);
    this.renderer.shadowMap.enabled = c.shadowMapSize > 0;
    this.shadowSize = -1;
    this.wantedKey = needsComposer(c, this.dofActive) ? chainKey(c) : '';
    this.chain?.setPixelRatio(c.pixelRatio);
    this.chain?.setSize(this.cssWidth, this.cssHeight);
    if (this.wantedKey === '') this.disposeChain();
    else this.ensurePostModule();
    this.updateSizeStats();
  }

  setSize(cssWidth: number, cssHeight: number): void {
    this.cssWidth = Math.max(1, cssWidth);
    this.cssHeight = Math.max(1, cssHeight);
    this.renderer.setSize(this.cssWidth, this.cssHeight, false);
    this.chain?.setSize(this.cssWidth, this.cssHeight);
    this.updateSizeStats();
  }

  /**
   * Depth of field for cutscenes (Cinematics). Takes effect only when the player's settings allow
   * it (graphics depthOfField); otherwise it is remembered and ignored. Allocation-free, so it can
   * be called every frame for focus pulls.
   * @param focusDistance view-space distance that stays sharp (world units)
   * @param aperture blur strength (0.005 subtle .. 0.05 strong)
   * @param maxBlur cap on the blur radius (fraction of the screen)
   */
  setDepthOfField(focusDistance: number, aperture = 0.02, maxBlur = 0.008): void {
    this.dofParams.focusDistance = focusDistance;
    this.dofParams.aperture = aperture;
    this.dofParams.maxBlur = maxBlur;
    if (!this.dofActive) {
      this.dofActive = true;
      this.wantedKey = needsComposer(this.config_, true) ? chainKey(this.config_) : '';
      this.ensurePostModule();
    }
    if (this.config_.depthOfField) this.chain?.setDepthOfField(this.dofParams);
  }

  clearDepthOfField(): void {
    if (!this.dofActive) return;
    this.dofActive = false;
    this.chain?.setDepthOfField(null);
    this.wantedKey = needsComposer(this.config_, false) ? chainKey(this.config_) : '';
    if (this.wantedKey === '') this.disposeChain();
  }

  get depthOfFieldActive(): boolean {
    return this.dofActive && this.config_.depthOfField;
  }

  addFrameListener(fn: FrameListener): () => void {
    this.listeners.push(fn);
    return () => {
      const i = this.listeners.indexOf(fn);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /**
   * Call first in every animation-loop callback. False = skip this callback entirely (FPS cap);
   * the skipped time is picked up by the next frame's timer delta, so simulation speed is exact.
   */
  beginFrame(now: number): boolean {
    if (this.lost) return false;
    if (!this.limiter.shouldRender(now)) return false;
    if (this.lastFrameTime >= 0) {
      const ms = now - this.lastFrameTime;
      this.stats.frameMs = ms;
      if (ms > 0) {
        const fps = 1000 / ms;
        this.stats.fps = this.stats.fps === 0 ? fps : this.stats.fps + (fps - this.stats.fps) * 0.1;
      }
    }
    this.lastFrameTime = now;
    return true;
  }

  /** Renders the active scene through the configured pipeline, then notifies frame listeners. */
  render(active: GameScene | null, deltaSeconds: number, now: number): void {
    if (this.lost) return;
    const info = this.renderer.info;
    info.reset();
    if (active && active.scene !== this.warmScene) this.startWarmup(active, now);
    if (active && this.warmPending && now < this.warmDeadline) {
      // Shaders of the new scene are still linking: draw nothing, the canvas keeps the last frame.
      active = null;
    } else this.warmPending = false;
    if (active) {
      if (now - this.lastCasterScan >= CASTER_SCAN_MS) {
        this.lastCasterScan = now;
        active.scene.traverse(this.assignCasterDepth);
      }
      this.applyShadows(active);
      this.syncChain(active);
      const chain = this.chain;
      if (chain && this.builtKey === this.wantedKey) {
        const era = active.era ?? DEFAULT_ERA;
        if (era !== this.gradedEra) {
          chain.setGrade(ERA_GRADES[era]);
          this.gradedEra = era;
        }
        if (this.config_.lightShafts) this.updateSun(active, chain);
        chain.render(deltaSeconds);
        this.stats.composer = true;
      } else {
        this.renderer.render(active.scene, active.camera);
        this.stats.composer = false;
      }
    }
    const s = this.stats;
    s.calls = info.render.calls;
    s.triangles = info.render.triangles;
    s.geometries = info.memory.geometries;
    s.textures = info.memory.textures;
    s.programs = info.programs?.length ?? 0;
    for (let i = 0; i < this.listeners.length; i++) {
      const fn = this.listeners[i];
      if (fn) fn(s.frameMs, now);
    }
  }

  handleContextLost(): void {
    this.lost = true;
  }

  /**
   * three.js re-creates its GL state and re-uploads geometry, materials and textures by itself.
   * Render targets owned here (composer buffers, shadow maps) are rebuilt from scratch, then the
   * active scene gets its optional onContextRestored() hook. Must run after three's own restore
   * listener (registered first, in the WebGLRenderer constructor).
   */
  handleContextRestored(active: GameScene | null): void {
    this.lost = false;
    this.warmScene = null;
    this.warmPending = false;
    // The old GL objects died with the old context: drop them without dispose() (deleting them
    // on the new context is an INVALID_OPERATION). Fresh ones are created on the next frame.
    this.chain = null;
    this.builtKey = '';
    this.chainScene = null;
    this.chainCamera = null;
    if (this.shadowSun) this.shadowSun.shadow.map = null;
    this.shadowSize = -1;
    this.fitter.invalidate();
    this.lastFrameTime = -1;
    this.limiter.setCap(this.config_.fpsCap);
    this.apply(this.resolved_);
    active?.onContextRestored?.();
  }

  dispose(): void {
    this.disposeChain();
    this.instancedDepth.dispose();
    this.instancedColorDepth.dispose();
    this.renderer.dispose();
  }

  /**
   * Precompiles every material of a newly active scene (including hidden objects: markers, LOD
   * cross-fade variants) with renderer.compileAsync, so the first frames of a level never stall on
   * a synchronous shader link. Shadow state is applied first: it is part of the program key.
   */
  private startWarmup(active: GameScene, now: number): void {
    this.warmScene = active.scene;
    this.warmups++;
    this.applyShadows(active);
    const scene = active.scene;
    scene.traverse(this.assignCasterDepth);
    this.lastCasterScan = now;
    let materials: Promise<unknown>;
    try {
      if (!this.renderer.extensions.has('KHR_parallel_shader_compile')) {
        // No parallel compile: link everything now (including hidden variants) and draw at once.
        this.renderer.compile(scene, active.camera);
        return;
      }
      materials = this.renderer.compileAsync(scene, active.camera);
    } catch (error) {
      console.error('[netivim] shader warm-up failed', error);
      return;
    }
    this.warmPending = true;
    this.warmDeadline = now + WARMUP_TIMEOUT_MS;
    materials
      .then(() => {
        if (this.warmScene === scene) this.warmPending = false;
      })
      .catch(() => {
        if (this.warmScene === scene) this.warmPending = false;
      });
  }

  private updateSizeStats(): void {
    this.stats.pixelRatio = this.renderer.getPixelRatio();
    this.stats.width = Math.round(this.cssWidth * this.stats.pixelRatio);
    this.stats.height = Math.round(this.cssHeight * this.stats.pixelRatio);
  }

  private ensurePostModule(): void {
    if (this.postModule || this.postLoading) return;
    this.postLoading = true;
    import('./post/chain')
      .then((m) => {
        this.postModule = m;
      })
      .catch((error: unknown) => {
        // Rendering continues without post effects; never a broken frame.
        console.error('[netivim] post-processing chunk failed to load', error);
      })
      .finally(() => {
        this.postLoading = false;
      });
  }

  private syncChain(active: GameScene): void {
    if (this.wantedKey === '') return;
    if (this.chain && this.builtKey === this.wantedKey && this.chainScene === active.scene && this.chainCamera === active.camera) return;
    if (this.chain && this.builtKey === this.wantedKey) {
      // Same configuration, new scene or camera: retarget instead of rebuilding (no buffer churn,
      // no shader re-link on the first frame of a level).
      this.chain.retarget(active.scene, active.camera);
      this.chainScene = active.scene;
      this.chainCamera = active.camera;
      this.gradedEra = null;
      return;
    }
    const m = this.postModule;
    if (!m) return;
    this.disposeChain();
    const chain = new m.PostChain(this.renderer, active.scene, active.camera, this.config_, this.cssWidth, this.cssHeight);
    this.chain = chain;
    this.builtKey = this.wantedKey;
    this.chainScene = active.scene;
    this.chainCamera = active.camera;
    this.gradedEra = null;
    chain.setDepthOfField(this.dofActive && this.config_.depthOfField ? this.dofParams : null);
  }

  private disposeChain(): void {
    this.chain?.dispose();
    this.chain = null;
    this.builtKey = '';
    this.chainScene = null;
    this.chainCamera = null;
  }

  private sunDirection(active: GameScene, sun: THREE.DirectionalLight | undefined): THREE.Vector3 | null {
    if (active.sunDirection) return active.sunDirection;
    if (!sun) return null;
    return this.tmpSun.copy(sun.position).sub(sun.target.position).normalize();
  }

  private applyShadows(active: GameScene): void {
    const sun = active.sun;
    if (!sun) {
      // Never keep the previous scene's sun: its parent chain would retain that whole scene graph
      // (tens of MB of CPU-side geometry) until the next sunlit scene.
      if (this.shadowSun) {
        this.shadowSun = null;
        this.shadowSize = -1;
      }
      return;
    }
    const size = this.config_.shadowMapSize;
    if (size === 0) {
      if (sun.castShadow) sun.castShadow = false;
      return;
    }
    if (!sun.castShadow) sun.castShadow = true;
    if (sun !== this.shadowSun || size !== this.shadowSize) {
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      sun.shadow.mapSize.set(size, size);
      sun.shadow.radius = this.config_.shadowRadius;
      this.shadowSun = sun;
      this.shadowSize = size;
      this.fitter.invalidate();
    }
    const dir = this.sunDirection(active, sun);
    if (!dir) return;
    const distance = (active.shadowDistance ?? DEFAULT_SHADOW_DISTANCE) * this.config_.shadowDistanceScale;
    this.fitter.fit(sun, active.camera, dir, distance, size);
  }

  private updateSun(active: GameScene, chain: PostChain): void {
    const dir = this.sunDirection(active, active.sun);
    if (!dir) {
      chain.setSun(0.5, 0.5, 0);
      return;
    }
    const cam = active.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.tmpForward);
    const facing = this.tmpForward.dot(dir);
    this.tmpScreen.copy(cam.position).addScaledVector(dir, SUN_FAR).project(cam);
    const u = this.tmpScreen.x * 0.5 + 0.5;
    const v = this.tmpScreen.y * 0.5 + 0.5;
    const off = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5));
    const strength = SHAFT_STRENGTH * smoothstep(0.05, 0.45, facing) * (1 - smoothstep(0.55, 1.2, off));
    chain.setSun(u, v, strength);
  }
}
