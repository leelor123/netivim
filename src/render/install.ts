import './graphics.css';
import type { Game } from '../game';
import type { GraphicsPreset } from '../core/settings';
import type { Params } from '../core/i18n';
import { getRenderPipeline, type RenderPipeline } from './renderPipeline';
import { PRESETS, presetBelow, resolveGraphics, minPreset, type GraphicsSettings } from './presets';
import { AdaptiveQuality, batterySuggestsSaver } from './adaptiveQuality';
import { BENCHMARK_BUDGET_MS, BENCHMARK_MEASURE_MS, BENCHMARK_WARMUP_MS, BenchmarkPlanner, classifyGpu, type GpuClass } from './benchmark';
import { DebugOverlay } from './debugOverlay';
import { setTitleTimeOverride } from '../scene/titleScene';

/** A user-facing notice (toast). textKey is a key in src/locales/he/graphics.json. */
export interface GraphicsNotice {
  readonly textKey: string;
  readonly params?: Params;
}

/**
 * DOM event carrying a GraphicsNotice until the lead adds a toast event to GameEvents
 * (requested in the M2 report). The UI agent's toast system listens for it on window.
 */
export const GRAPHICS_NOTICE_EVENT = 'netivim:graphics-notice';

/** E2E/visual-test hook (VITE_TEST_HOOKS builds only). */
export interface GraphicsTestHook {
  readonly pipeline: RenderPipeline;
  readonly benchmarkRunning: boolean;
  readonly lastNotice: GraphicsNotice | null;
  readonly adaptiveCap: GraphicsPreset | null;
  setAdaptiveEnabled(on: boolean): void;
  /** Pins the title camera to a time (seconds) for deterministic screenshots; null = live. */
  setTitleTime(t: number | null): void;
}

declare global {
  interface Window {
    __netivimGraphics?: GraphicsTestHook;
  }
}

interface BatteryLike extends EventTarget {
  readonly level: number;
  readonly charging: boolean;
}

const CONTEXT_RESTORE_TIMEOUT_MS = 4000;
const MAX_BENCH_FRAMES = 512;

function readGpuClass(pipeline: RenderPipeline): GpuClass {
  try {
    const gl = pipeline.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    return classifyGpu(typeof name === 'string' ? name : '');
  } catch {
    return 'unknown';
  }
}

function sameQuality(a: GraphicsSettings, b: GraphicsSettings): boolean {
  return a.mode === b.mode && a.preset === b.preset && a.custom === b.custom;
}

/**
 * Graphics system install (CONTRACTS 11): live settings, first-launch benchmark (Auto), adaptive
 * quality, battery hint, debug overlay, and the "context could not be restored" message.
 */
export function installGraphics(game: Game): () => void {
  const pipeline = getRenderPipeline(game.renderer);
  if (!pipeline) throw new Error('installGraphics: the renderer was not created by RenderPipeline');
  const { settings, bus, scenes, i18n } = game;

  let adaptiveEnabled = true;
  let adaptiveCap: GraphicsPreset | null = null;
  let batteryCap: GraphicsPreset | null = null;
  let lastNotice: GraphicsNotice | null = null;
  let selfUpdate = false;
  let prev = settings.value.graphics;
  const adaptive = new AdaptiveQuality();
  let overlay: DebugOverlay | null = null;

  const notify = (textKey: string, params?: Params): void => {
    lastNotice = params ? { textKey, params } : { textKey };
    window.dispatchEvent(new CustomEvent<GraphicsNotice>(GRAPHICS_NOTICE_EVENT, { detail: lastNotice }));
  };

  const runtimeCap = (g: GraphicsSettings): GraphicsPreset | null => {
    let cap = adaptiveCap;
    if (g.mode === 'auto' && batteryCap) cap = cap ? minPreset(cap, batteryCap) : batteryCap;
    return cap;
  };

  const applyQuality = (): void => {
    const g = settings.value.graphics;
    const resolved = resolveGraphics(g, runtimeCap(g));
    pipeline.apply(resolved);
    scenes.setGraphics(resolved);
    adaptive.setTargetFps(resolved.options.fpsCap);
    adaptive.reset(performance.now());
    overlay?.setPreset(resolved.preset);
  };

  const syncOverlay = (): void => {
    const want = settings.value.graphics.debugOverlay;
    if (want && !overlay) {
      overlay = new DebugOverlay(i18n);
      overlay.setPreset(pipeline.resolved.preset);
      document.body.append(overlay.root);
    } else if (!want && overlay) {
      overlay.dispose();
      overlay = null;
    }
  };

  const persist = (patch: Partial<GraphicsSettings>): void => {
    selfUpdate = true;
    try {
      settings.update('graphics', patch);
    } finally {
      selfUpdate = false;
    }
  };

  // ---- First-launch benchmark (Auto mode) --------------------------------------------------
  const benchFrames = new Float64Array(MAX_BENCH_FRAMES);
  let benchCount = 0;
  let planner: BenchmarkPlanner | null = null;
  let benchStart = 0;
  let runStart = 0;
  let runWaiting = true;

  const startRun = (now: number): void => {
    const c = planner?.candidate;
    if (!c) return;
    // Measure headroom uncapped; the chosen preset keeps its own cap afterwards.
    const options = { ...PRESETS[c], fpsCap: 0 as const };
    pipeline.apply({ options, preset: c });
    scenes.setGraphics({ options, preset: c });
    benchCount = 0;
    runStart = now;
    runWaiting = true;
  };

  const finishBenchmark = (chosen: GraphicsPreset | null): void => {
    planner = null;
    if (chosen === null) {
      applyQuality();
      return;
    }
    persist({ preset: chosen, benchmarked: true });
    notify('graphics.toast.benchmarkDone', { preset: i18n.t('graphics.preset.' + chosen) });
  };

  const benchFrame = (frameMs: number, now: number): void => {
    if (!planner) return;
    if (document.visibilityState === 'hidden') {
      // Measurements from a hidden page mean nothing: try again next launch.
      finishBenchmark(null);
      return;
    }
    if (runWaiting) {
      // The clock starts once the preset's lazy post chunk is in and shaders have had warm-up time.
      if (!pipeline.ready) runStart = now;
      if (now - runStart < BENCHMARK_WARMUP_MS) return;
      runWaiting = false;
      runStart = now;
      return;
    }
    if (benchCount < MAX_BENCH_FRAMES) benchFrames[benchCount++] = frameMs;
    const elapsed = now - benchStart;
    if (now - runStart < BENCHMARK_MEASURE_MS && elapsed < BENCHMARK_BUDGET_MS) return;
    planner.report(Array.from(benchFrames.subarray(0, benchCount)), elapsed);
    if (planner.done) finishBenchmark(planner.chosen);
    else if (elapsed >= BENCHMARK_BUDGET_MS) finishBenchmark(planner.candidate);
    else startRun(now);
  };

  const maybeStartBenchmark = (): void => {
    const g = settings.value.graphics;
    if (g.mode !== 'auto' || g.benchmarked || planner) return;
    planner = new BenchmarkPlanner(readGpuClass(pipeline));
    benchStart = performance.now();
    startRun(benchStart);
  };

  // ---- Adaptive quality --------------------------------------------------------------------
  const adaptiveFrame = (frameMs: number, now: number): void => {
    if (planner || !adaptiveEnabled) return;
    const g = settings.value.graphics;
    if (g.mode === 'custom') return;
    if (!adaptive.sample(frameMs, now)) return;
    const current = pipeline.resolved.preset;
    const lower = current ? presetBelow(current) : null;
    if (!lower) return;
    adaptiveCap = lower;
    // In Auto the benchmark guessed too high: remember the lower preset for next launch.
    if (g.mode === 'auto') persist({ preset: lower });
    applyQuality();
    notify('graphics.toast.lowered', { preset: i18n.t('graphics.preset.' + lower) });
  };

  const removeFrameListener = pipeline.addFrameListener((frameMs, now) => {
    benchFrame(frameMs, now);
    adaptiveFrame(frameMs, now);
    overlay?.update(pipeline.stats, now);
  });

  // ---- Settings ------------------------------------------------------------------------------
  const offSettings = bus.on('settings:changed', ({ key }) => {
    if (key !== 'graphics') return;
    const g = settings.value.graphics;
    const qualityChanged = !sameQuality(prev, g);
    prev = g;
    syncOverlay();
    if (!qualityChanged) return;
    if (!selfUpdate) {
      // An explicit player choice wins over the benchmark and clears the adaptive ceiling.
      if (planner) planner = null;
      adaptiveCap = null;
    }
    applyQuality();
  });

  // ---- Battery hint (Auto mode only) -----------------------------------------------------------
  let battery: BatteryLike | null = null;
  const onBattery = (): void => {
    if (!battery) return;
    const next = batterySuggestsSaver(battery.level, battery.charging) ? 'battery' : null;
    if (next === batteryCap) return;
    batteryCap = next;
    if (settings.value.graphics.mode !== 'auto') return;
    applyQuality();
    notify(next ? 'graphics.toast.batterySaver' : 'graphics.toast.batteryRestored');
  };
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  if (typeof nav.getBattery === 'function') {
    nav
      .getBattery()
      .then((b) => {
        battery = b;
        b.addEventListener('levelchange', onBattery);
        b.addEventListener('chargingchange', onBattery);
        onBattery();
      })
      .catch(() => {
        // No battery information: nothing to adapt to.
      });
  }

  // ---- Context loss that never comes back -------------------------------------------------------
  const canvas = game.renderer.domElement;
  let lostTimer: ReturnType<typeof setTimeout> | null = null;
  let lostMessage: HTMLElement | null = null;
  const onLost = (): void => {
    if (lostTimer !== null) return;
    lostTimer = setTimeout(() => {
      lostMessage = document.createElement('div');
      lostMessage.className = 'overlay gfx-context-lost';
      lostMessage.setAttribute('role', 'alert');
      const p = document.createElement('p');
      p.className = 'fatal';
      p.textContent = i18n.t('graphics.contextLost');
      lostMessage.append(p);
      document.body.append(lostMessage);
    }, CONTEXT_RESTORE_TIMEOUT_MS);
  };
  const onRestored = (): void => {
    if (lostTimer !== null) clearTimeout(lostTimer);
    lostTimer = null;
    lostMessage?.remove();
    lostMessage = null;
    adaptive.reset(performance.now());
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // ---- Start -----------------------------------------------------------------------------------
  scenes.setGraphics(pipeline.resolved);
  applyQuality();
  syncOverlay();
  maybeStartBenchmark();

  if (import.meta.env.VITE_TEST_HOOKS === '1') {
    window.__netivimGraphics = {
      pipeline,
      get benchmarkRunning() {
        return planner !== null;
      },
      get lastNotice() {
        return lastNotice;
      },
      get adaptiveCap() {
        return adaptiveCap;
      },
      setAdaptiveEnabled(on) {
        adaptiveEnabled = on;
        adaptive.reset(performance.now());
      },
      setTitleTime: setTitleTimeOverride,
    };
  }

  return () => {
    removeFrameListener();
    offSettings();
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    if (lostTimer !== null) clearTimeout(lostTimer);
    lostMessage?.remove();
    battery?.removeEventListener('levelchange', onBattery);
    battery?.removeEventListener('chargingchange', onBattery);
    overlay?.dispose();
    overlay = null;
    planner = null;
    if (import.meta.env.VITE_TEST_HOOKS === '1') delete window.__netivimGraphics;
  };
}
