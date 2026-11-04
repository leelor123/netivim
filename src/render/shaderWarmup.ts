import type * as THREE from 'three';

/**
 * Incremental shader warm-up for a newly active scene.
 *
 * Every material variant the scene can draw (hidden objects included: markers, LOD cross-fade
 * carriers) is compiled a few objects at a time, at most `budgetMs` of main-thread work per frame,
 * so a level start never blocks the page for seconds (a long block starves the Android WebView's
 * input dispatch and ends in an ANR).
 * - With KHR_parallel_shader_compile, compile() only queues the link; the programs are polled with
 *   the non-blocking COMPLETION_STATUS query until they are all linked.
 * - Without it, each program's link is forced right after its compile (the blocking status query
 *   three.js would otherwise make on the first draw), one program at a time, so the stalls are
 *   spread over frames instead of landing in one.
 * - Nothing runs while the page is hidden; a long frame gap (hidden, paused, or a very slow frame)
 *   counts as one short tick toward the cap, never as the whole gap, and never as nothing.
 * The cap (`capMs` of visible time) ends the warm-up even if something is still linking: the
 * first draw then finishes the job the way three.js always does.
 */

/** The renderer surface the warm-up needs (WebGLRenderer in the game, a fake in unit tests). */
export interface WarmupTarget {
  /** Compiles every material under `object` with the lights of `scene` (WebGLRenderer.compile). */
  compile(object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): void;
  /** The program three.js built for a material, if any. */
  programOf(material: THREE.Material): WarmupProgram | undefined;
  /** KHR_parallel_shader_compile is available (non-blocking link status). */
  readonly parallel: boolean;
}

export interface WarmupProgram {
  isReady(): boolean;
  getUniforms(): unknown;
}

export interface WarmupOptions {
  /** Main-thread time per frame (ms). */
  readonly budgetMs: number;
  /** Visible time after which the scene is drawn anyway (ms). */
  readonly capMs: number;
  /** A frame gap above this (ms) counts as this much toward the cap (pause, hidden page, slow frame). */
  readonly stallMs?: number;
  readonly clock?: () => number;
  readonly hidden?: () => boolean;
}

interface Renderable extends THREE.Object3D {
  readonly isMesh?: boolean;
  readonly isPoints?: boolean;
  readonly isLine?: boolean;
  readonly isSprite?: boolean;
  readonly isInstancedMesh?: boolean;
  readonly isBatchedMesh?: boolean;
  readonly isSkinnedMesh?: boolean;
  readonly instanceColor?: unknown;
  readonly morphTargetInfluences?: unknown;
  readonly material?: THREE.Material | THREE.Material[];
}

function materialsOf(o: Renderable): readonly THREE.Material[] {
  const m = o.material;
  if (!m) return [];
  return Array.isArray(m) ? m : [m];
}

/** Objects that share a material and the same object-side program flags compile to one program. */
function variantKey(o: Renderable, m: THREE.Material): string {
  return (
    m.uuid +
    (o.isInstancedMesh ? 'i' : '') +
    (o.instanceColor ? 'c' : '') +
    (o.isBatchedMesh ? 'b' : '') +
    (o.isSkinnedMesh ? 's' : '') +
    (o.morphTargetInfluences ? 'm' : '') +
    (o.isPoints ? 'p' : o.isLine ? 'l' : o.isSprite ? 'S' : '')
  );
}

const defaultHidden = (): boolean => typeof document !== 'undefined' && document.hidden;
const defaultClock = (): number => performance.now();

export class ShaderWarmup {
  private readonly queue: Renderable[] = [];
  private readonly pending: THREE.Material[] = [];
  private scene: THREE.Scene | null = null;
  private camera: THREE.Camera | null = null;
  private spentMs = 0;
  private lastStep = -1;
  private startedAt = 0;
  private running = false;
  /** Objects compiled by the last warm-up (tests and the perf report). */
  compiled = 0;
  private readonly clock: () => number;
  private readonly hidden: () => boolean;
  private readonly stallMs: number;

  constructor(
    private readonly target: WarmupTarget,
    private readonly opts: WarmupOptions,
  ) {
    this.clock = opts.clock ?? defaultClock;
    this.hidden = opts.hidden ?? defaultHidden;
    this.stallMs = opts.stallMs ?? 250;
  }

  /** True when no warm-up is running (finished, capped, cancelled or never started). */
  get done(): boolean {
    return !this.running;
  }

  /**
   * True while the warm-up should hold the simulation back. Also ends on wall-clock time (twice
   * the cap), so code that steps the game without frames (tools, tests) is never held for good.
   */
  get blocking(): boolean {
    return this.running && this.clock() - this.startedAt < this.opts.capMs * 2;
  }

  /** Queues every material variant of `scene`; nothing compiles until step(). */
  start(scene: THREE.Scene, camera: THREE.Camera): void {
    this.cancel();
    const seen = new Set<string>();
    scene.traverse((obj) => {
      const o = obj as Renderable;
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      let fresh = false;
      for (const m of materialsOf(o)) {
        const key = variantKey(o, m);
        if (seen.has(key)) continue;
        seen.add(key);
        fresh = true;
      }
      if (fresh) this.queue.push(o);
    });
    // Compile in scene order (front of the list first).
    this.queue.reverse();
    this.scene = scene;
    this.camera = camera;
    this.spentMs = 0;
    this.lastStep = -1;
    this.compiled = 0;
    this.startedAt = this.clock();
    this.running = true;
  }

  /** Drops the warm-up and every reference it holds (scene, camera, objects, materials). */
  cancel(): void {
    this.queue.length = 0;
    this.pending.length = 0;
    this.scene = null;
    this.camera = null;
    this.running = false;
  }

  /**
   * One frame of work. Returns true when the scene may be drawn (done or capped).
   * `now` is the frame time (ms); the work itself is bounded with the warm-up clock.
   */
  step(now: number): boolean {
    if (!this.running) return true;
    if (this.hidden()) {
      this.lastStep = -1;
      return false;
    }
    const gap = this.lastStep < 0 ? 0 : now - this.lastStep;
    this.lastStep = now;
    // A long gap is a hidden page, a paused WebView or a very slow frame: it counts as one
    // stall-length tick, so the cap is always reached after a bounded number of frames (slow
    // software GL never keeps a scene waiting forever) but a pause does not eat the whole cap.
    if (gap > 0) this.spentMs += gap < this.stallMs ? gap : this.stallMs;
    const scene = this.scene;
    const camera = this.camera;
    if (!scene || !camera) {
      this.cancel();
      return true;
    }
    const t0 = this.clock();
    try {
      while (this.queue.length > 0 && this.clock() - t0 < this.opts.budgetMs) {
        const o = this.queue.pop() as Renderable;
        this.target.compile(o, camera, scene);
        this.compiled++;
        for (const m of materialsOf(o)) {
          const program = this.target.programOf(m);
          if (!program) continue;
          if (this.target.parallel) this.pending.push(m);
          // No parallel compile: force this one link now (bounded), not all of them on one draw.
          else program.getUniforms();
        }
      }
      if (this.queue.length === 0) {
        for (let i = this.pending.length - 1; i >= 0; i--) {
          const program = this.target.programOf(this.pending[i] as THREE.Material);
          // Disposed materials have no program any more: nothing to wait for.
          if (!program || program.isReady()) this.pending.splice(i, 1);
        }
      }
    } catch (error) {
      console.error('[netivim] shader warm-up failed', error);
      this.cancel();
      return true;
    }
    if ((this.queue.length === 0 && this.pending.length === 0) || this.spentMs >= this.opts.capMs) {
      this.cancel();
      return true;
    }
    return false;
  }

  /** Remaining queued objects (tests). */
  get queued(): number {
    return this.queue.length;
  }
}
