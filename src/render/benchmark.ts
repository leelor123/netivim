import type { GraphicsPreset } from '../core/settings';
import { presetBelow } from './presets';

/** Total benchmark budget (BRIEF: short, under 3 s, behind the title). */
export const BENCHMARK_BUDGET_MS = 2800;
/** Per candidate preset: frames during warm-up (shader compile, uploads) are not judged. */
export const BENCHMARK_WARMUP_MS = 250;
export const BENCHMARK_MEASURE_MS = 450;
export const TARGET_FRAME_MS = 1000 / 60;

export type GpuClass = 'high' | 'mid' | 'low' | 'software' | 'unknown';

/**
 * Coarse class from the unmasked WebGL renderer string. Only a starting point and a tie breaker:
 * the measured frame times decide. The S26 Ultra (Snapdragon 8 Elite Gen 5, Adreno 8xx) is 'high'.
 */
export function classifyGpu(renderer: string): GpuClass {
  const r = renderer.toLowerCase();
  if (r === '') return 'unknown';
  if (/swiftshader|llvmpipe|softpipe|software|basic render/.test(r)) return 'software';
  const adreno = /adreno[^0-9]*(\d{3})/.exec(r);
  if (adreno?.[1]) {
    const n = Number(adreno[1]);
    if (n >= 730) return 'high';
    if (n >= 640) return 'mid';
    return 'low';
  }
  if (/immortalis|mali-g7[1-9]\d|mali-g9\d\d|xclipse 9\d\d|apple (m\d|a1[6-9]|gpu)|nvidia|geforce|radeon|amd|arc\b/.test(r)) return 'high';
  if (/mali-g(5\d|6\d|7[1-7])\b|xclipse|powervr|intel/.test(r)) return 'mid';
  if (/mali|adreno|vivante/.test(r)) return 'low';
  return 'unknown';
}

/** The preset the benchmark tries first. */
export function startPresetFor(gpu: GpuClass): GraphicsPreset {
  switch (gpu) {
    case 'high':
    case 'unknown':
      return 'ultra';
    case 'mid':
      return 'high';
    case 'low':
      return 'medium';
    case 'software':
      return 'low';
  }
}

/** Nearest-rank percentile of a sample (copied and sorted; called once per run, not per frame). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank] ?? Infinity;
}

/**
 * A run passes when 90% of frames fit the 60 fps budget (10% slack). Known high-end GPUs get a
 * little more slack: first-launch frames still include driver warm-up, and adaptive quality
 * steps down later if Ultra really cannot hold.
 */
export function runPasses(frameTimesMs: readonly number[], gpu: GpuClass): boolean {
  if (frameTimesMs.length < 8) return false;
  const slack = gpu === 'high' ? 1.35 : 1.1;
  return percentile(frameTimesMs, 90) <= TARGET_FRAME_MS * slack;
}

/** Walks presets downward from the start until one passes or the time budget runs out. */
export class BenchmarkPlanner {
  private current: GraphicsPreset;
  private result: GraphicsPreset | null = null;

  constructor(
    private readonly gpu: GpuClass,
    private readonly budgetMs = BENCHMARK_BUDGET_MS,
  ) {
    this.current = startPresetFor(gpu);
  }

  /** The preset to measure next, or null when finished. */
  get candidate(): GraphicsPreset | null {
    return this.result === null ? this.current : null;
  }

  get done(): boolean {
    return this.result !== null;
  }

  /** The chosen preset (only once done). */
  get chosen(): GraphicsPreset | null {
    return this.result;
  }

  /** Reports the frame times of the run for `candidate`; elapsedMs is the total benchmark time so far. */
  report(frameTimesMs: readonly number[], elapsedMs: number): void {
    if (this.result !== null) return;
    if (runPasses(frameTimesMs, this.gpu)) {
      this.result = this.current;
      return;
    }
    const lower = presetBelow(this.current);
    const runMs = BENCHMARK_WARMUP_MS + BENCHMARK_MEASURE_MS;
    if (lower === null) {
      this.result = this.current;
    } else if (elapsedMs + runMs > this.budgetMs) {
      // Out of time: the next lower preset is the safest pick without another measurement.
      this.result = lower;
    } else {
      this.current = lower;
    }
  }
}
