import { Rng } from './util';

export type NoiseKind = 'white' | 'pink' | 'brown';

const SECONDS: Record<NoiseKind, number> = { white: 2, pink: 4, brown: 4 };
/** Length of the equal-power crossfade that makes the buffer loop without a seam. */
const SEAM_SECONDS = 0.25;

/**
 * Generates one channel of noise whose end blends into its start, so a looping source has no
 * audible seam. Pure (no Web Audio), so it can be tested directly.
 */
export function generateLoopableNoise(kind: NoiseKind, length: number, seamLength: number, seed: number): Float32Array<ArrayBuffer> {
  const rng = new Rng(seed);
  const total = length + seamLength;
  const raw = new Float32Array(total);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  let brown = 0;
  for (let i = 0; i < total; i++) {
    const white = rng.next() * 2 - 1;
    if (kind === 'white') {
      raw[i] = white;
    } else if (kind === 'pink') {
      // Paul Kellet's economy pink filter.
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      raw[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    } else {
      brown = (brown + 0.02 * white) / 1.02;
      raw[i] = brown * 3.5;
    }
  }
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = raw[i] ?? 0;
  for (let i = 0; i < seamLength && i < length; i++) {
    const w = i / seamLength;
    out[i] = (raw[i] ?? 0) * Math.sin(w * Math.PI * 0.5) + (raw[length + i] ?? 0) * Math.cos(w * Math.PI * 0.5);
  }
  return out;
}

/** Lazily built, cached noise buffers for one AudioContext. */
export class NoiseBank {
  private readonly cache = new Map<NoiseKind, AudioBuffer>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly seed: number,
  ) {}

  get(kind: NoiseKind): AudioBuffer {
    let buf = this.cache.get(kind);
    if (!buf) {
      const rate = this.ctx.sampleRate;
      const length = Math.floor(SECONDS[kind] * rate);
      buf = this.ctx.createBuffer(1, length, rate);
      buf.copyToChannel(generateLoopableNoise(kind, length, Math.floor(SEAM_SECONDS * rate), this.seed + kind.length), 0);
      this.cache.set(kind, buf);
    }
    return buf;
  }

  /** A ready-to-start looping source with a random start offset. */
  source(kind: NoiseKind, loop: boolean): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.get(kind);
    src.loop = loop;
    return src;
  }
}
