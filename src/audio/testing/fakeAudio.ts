/**
 * A tiny fake Web Audio implementation for unit tests. It records the graph and parameter
 * automation so tests can assert on bus gains, connections and lifecycle. Never imported by
 * production code.
 */
export class FakeParam {
  /** Last value the automation is heading to. */
  target: number;
  readonly events: { kind: string; value: number; time: number }[] = [];
  private current: number;

  constructor(initial = 0) {
    this.current = initial;
    this.target = initial;
  }

  get value(): number {
    return this.current;
  }

  /** Assigning .value behaves like the real API: it sets the intrinsic value. */
  set value(v: number) {
    this.current = v;
    this.target = v;
  }

  setValueAtTime(v: number, t: number): this {
    this.current = v;
    this.target = v;
    this.events.push({ kind: 'set', value: v, time: t });
    return this;
  }

  linearRampToValueAtTime(v: number, t: number): this {
    this.target = v;
    this.current = v;
    this.events.push({ kind: 'linear', value: v, time: t });
    return this;
  }

  exponentialRampToValueAtTime(v: number, t: number): this {
    this.target = v;
    this.current = v;
    this.events.push({ kind: 'exp', value: v, time: t });
    return this;
  }

  setTargetAtTime(v: number, t: number): this {
    this.target = v;
    this.current = v;
    this.events.push({ kind: 'target', value: v, time: t });
    return this;
  }

  cancelScheduledValues(t: number): this {
    this.events.push({ kind: 'cancel', value: 0, time: t });
    return this;
  }
}

export class FakeNode {
  readonly connections: unknown[] = [];
  disconnected = false;

  connect<T>(dest: T): T {
    this.connections.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

export class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1);
}

export class FakeOscillator extends FakeNode {
  type = 'sine';
  readonly frequency = new FakeParam(440);
  readonly detune = new FakeParam(0);
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;

  start(t = 0): void {
    this.started = t;
  }

  stop(t = 0): void {
    this.stopped = t;
  }
}

export class FakeBiquad extends FakeNode {
  type = 'lowpass';
  readonly frequency = new FakeParam(350);
  readonly Q = new FakeParam(1);
  readonly gain = new FakeParam(0);
}

export class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24);
  readonly knee = new FakeParam(30);
  readonly ratio = new FakeParam(12);
  readonly attack = new FakeParam(0.003);
  readonly release = new FakeParam(0.25);
}

export class FakeDelay extends FakeNode {
  readonly delayTime = new FakeParam(0);
}

export class FakeBuffer {
  readonly channels: Float32Array[];

  constructor(
    channels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: channels }, () => new Float32Array(length));
  }

  copyToChannel(src: Float32Array, ch: number): void {
    this.channels[ch]?.set(src);
  }

  getChannelData(ch: number): Float32Array {
    return this.channels[ch] ?? new Float32Array(0);
  }
}

export class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  readonly playbackRate = new FakeParam(1);
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;

  start(t = 0): void {
    this.started = t;
  }

  stop(t = 0): void {
    this.stopped = t;
  }
}

export class FakeAudioContext {
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly sampleRate = 8000;
  readonly destination = new FakeNode();
  onstatechange: (() => void) | null = null;
  resumeCalls = 0;
  suspendCalls = 0;
  readonly gains: FakeGain[] = [];
  readonly oscillators: FakeOscillator[] = [];
  readonly sources: FakeBufferSource[] = [];
  readonly compressors: FakeCompressor[] = [];
  readonly filters: FakeBiquad[] = [];

  resume(): Promise<void> {
    this.resumeCalls++;
    this.state = 'running';
    this.onstatechange?.();
    return Promise.resolve();
  }

  suspend(): Promise<void> {
    this.suspendCalls++;
    this.state = 'suspended';
    this.onstatechange?.();
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }

  createOscillator(): FakeOscillator {
    const o = new FakeOscillator();
    this.oscillators.push(o);
    return o;
  }

  createBiquadFilter(): FakeBiquad {
    const f = new FakeBiquad();
    this.filters.push(f);
    return f;
  }

  createDynamicsCompressor(): FakeCompressor {
    const c = new FakeCompressor();
    this.compressors.push(c);
    return c;
  }

  createDelay(): FakeDelay {
    return new FakeDelay();
  }

  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    return new FakeBuffer(channels, length, rate);
  }

  createBufferSource(): FakeBufferSource {
    const s = new FakeBufferSource();
    this.sources.push(s);
    return s;
  }
}

export function asAudioContext(fake: FakeAudioContext): AudioContext {
  return fake as unknown as AudioContext;
}
