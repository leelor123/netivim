import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings, type GraphicsPreset } from '../../src/core/settings';
import { PRESETS, PRESET_ORDER, presetBelow, resolveGraphics, minPreset } from '../../src/render/presets';
import { chainKey, needsComposer, pixelRatioFor, toPipelineConfig, type DeviceInfo } from '../../src/render/pipelineConfig';
import { AdaptiveQuality, DEFAULT_ADAPTIVE, batterySuggestsSaver } from '../../src/render/adaptiveQuality';
import { FrameLimiter } from '../../src/render/frameLimiter';
import { BenchmarkPlanner, classifyGpu, percentile, runPasses, startPresetFor } from '../../src/render/benchmark';
import { frustumSliceSphere, shadowTexelSize } from '../../src/render/shadows';
import { ERA_GRADES } from '../../src/render/eras';

const PHONE: DeviceInfo = { devicePixelRatio: 3.5, maxTextureSize: 16384, maxSamples: 8 };

describe('presets (DESIGN 8)', () => {
  it('lists five presets from cheapest to most expensive', () => {
    expect(PRESET_ORDER).toEqual(['battery', 'low', 'medium', 'high', 'ultra']);
  });

  it('matches the budget table', () => {
    expect(PRESETS.battery).toMatchObject({ resolutionScale: 0.6, fpsCap: 30, shadows: 'off', antialias: 'none', bloom: false });
    expect(PRESETS.low).toMatchObject({ resolutionScale: 0.75, shadows: 'off', antialias: 'fxaa', bloom: false });
    expect(PRESETS.medium).toMatchObject({ resolutionScale: 0.85, shadows: 'medium', antialias: 'fxaa', fog: true, bloom: false });
    expect(PRESETS.high).toMatchObject({ resolutionScale: 1, shadows: 'high', antialias: 'smaa', bloom: true, fog: true });
    expect(PRESETS.ultra).toMatchObject({ resolutionScale: 0, shadows: 'ultra', antialias: 'msaa', ambientOcclusion: true, bloom: true, colorGrading: true });
  });

  it('keeps motion blur off on every preset', () => {
    for (const p of PRESET_ORDER) expect(PRESETS[p].motionBlur).toBe(false);
  });

  it('every preset survives settings validation unchanged', () => {
    for (const p of PRESET_ORDER) {
      const s = sanitizeSettings({ graphics: { mode: 'custom', custom: PRESETS[p] } });
      expect(s.graphics.custom).toEqual(PRESETS[p]);
    }
  });

  it('densities and distances grow monotonically with the preset', () => {
    for (let i = 1; i < PRESET_ORDER.length; i++) {
      const lo = PRESETS[PRESET_ORDER[i - 1] as GraphicsPreset];
      const hi = PRESETS[PRESET_ORDER[i] as GraphicsPreset];
      expect(hi.vegetation).toBeGreaterThanOrEqual(lo.vegetation);
      expect(hi.particles).toBeGreaterThanOrEqual(lo.particles);
      expect(hi.renderDistance).toBeGreaterThanOrEqual(lo.renderDistance);
    }
  });

  it('steps down one level at a time and stops at the bottom', () => {
    expect(presetBelow('ultra')).toBe('high');
    expect(presetBelow('low')).toBe('battery');
    expect(presetBelow('battery')).toBeNull();
    expect(minPreset('high', 'low')).toBe('low');
  });
});

describe('resolveGraphics', () => {
  const g = DEFAULT_SETTINGS.graphics;

  it('auto uses the benchmarked preset', () => {
    const r = resolveGraphics({ ...g, mode: 'auto', preset: 'ultra' });
    expect(r.preset).toBe('ultra');
    expect(r.options).toEqual(PRESETS.ultra);
  });

  it('preset mode uses the chosen preset', () => {
    expect(resolveGraphics({ ...g, mode: 'preset', preset: 'low' }).options).toEqual(PRESETS.low);
  });

  it('custom uses the custom options and reports no preset', () => {
    const custom = { ...PRESETS.medium, bloom: true, motionBlur: true };
    const r = resolveGraphics({ ...g, mode: 'custom', custom });
    expect(r.preset).toBeNull();
    expect(r.options).toBe(custom);
  });

  it('a runtime cap lowers auto/preset but never raises them and never touches custom', () => {
    expect(resolveGraphics({ ...g, mode: 'auto', preset: 'ultra' }, 'medium').preset).toBe('medium');
    expect(resolveGraphics({ ...g, mode: 'preset', preset: 'low' }, 'high').preset).toBe('low');
    const custom = { ...PRESETS.ultra };
    expect(resolveGraphics({ ...g, mode: 'custom', custom }, 'battery').options).toBe(custom);
  });
});

describe('settings -> pipeline options', () => {
  it('native resolution is the device pixel ratio capped at 2', () => {
    expect(pixelRatioFor(0, 3.5)).toBe(2);
    expect(pixelRatioFor(0, 1.25)).toBe(1.25);
  });

  it('resolution scale is relative to the 1.5 reference ratio (or a lower device ratio)', () => {
    expect(pixelRatioFor(1, 3)).toBeCloseTo(1.5);
    expect(pixelRatioFor(0.6, 3)).toBeCloseTo(0.9);
    expect(pixelRatioFor(0.5, 1)).toBeCloseTo(0.5);
    expect(pixelRatioFor(0.75, 1)).toBeCloseTo(0.75);
  });

  it('ultra: MSAA 4x + SMAA, 4096 shadows, AO, bloom, shafts, grading and dither', () => {
    const c = toPipelineConfig(PRESETS.ultra, PHONE);
    expect(c).toMatchObject({ pixelRatio: 2, msaaSamples: 4, smaa: true, fxaa: false, shadowMapSize: 4096, ambientOcclusion: true, bloom: true, lightShafts: true, grading: true, dither: true, motionBlur: false });
  });

  it('high: SMAA, 2048 shadows, no AO or MSAA', () => {
    const c = toPipelineConfig(PRESETS.high, PHONE);
    expect(c).toMatchObject({ msaaSamples: 0, smaa: true, shadowMapSize: 2048, ambientOcclusion: false, bloom: true, lightShafts: false });
  });

  it('medium and low: FXAA; medium has 1024 shadows, low none', () => {
    expect(toPipelineConfig(PRESETS.medium, PHONE)).toMatchObject({ fxaa: true, smaa: false, shadowMapSize: 1024 });
    expect(toPipelineConfig(PRESETS.low, PHONE)).toMatchObject({ fxaa: true, shadowMapSize: 0 });
  });

  it('battery saver runs without the composer at 30 fps', () => {
    const c = toPipelineConfig(PRESETS.battery, PHONE);
    expect(c.fpsCap).toBe(30);
    expect(needsComposer(c, false)).toBe(false);
  });

  it('every preset above battery saver needs the composer (FXAA is a post pass)', () => {
    for (const p of ['low', 'medium', 'high', 'ultra'] as const) expect(needsComposer(toPipelineConfig(PRESETS[p], PHONE), false)).toBe(true);
  });

  it('depth of field alone builds the composer only while a cutscene requests it', () => {
    const c = toPipelineConfig({ ...PRESETS.battery, depthOfField: true }, PHONE);
    expect(needsComposer(c, false)).toBe(false);
    expect(needsComposer(c, true)).toBe(true);
  });

  it('clamps shadow map size and MSAA samples to the GPU limits', () => {
    const weak: DeviceInfo = { devicePixelRatio: 2, maxTextureSize: 2048, maxSamples: 2 };
    const c = toPipelineConfig(PRESETS.ultra, weak);
    expect(c.shadowMapSize).toBe(2048);
    expect(c.msaaSamples).toBe(2);
  });

  it('the chain key ignores resolution and fps (no rebuild for those) but not effects', () => {
    const a = toPipelineConfig(PRESETS.high, PHONE);
    const b = toPipelineConfig({ ...PRESETS.high, resolutionScale: 0.5, fpsCap: 30 }, PHONE);
    const c = toPipelineConfig({ ...PRESETS.high, bloom: false }, PHONE);
    expect(chainKey(a)).toBe(chainKey(b));
    expect(chainKey(a)).not.toBe(chainKey(c));
  });
});

describe('AdaptiveQuality (hysteresis and cooldown)', () => {
  const o = DEFAULT_ADAPTIVE;
  /** Feeds frames at a fixed frame time from t, returns [stepDowns, endTime]. */
  function run(a: AdaptiveQuality, frameMs: number, durationMs: number, t: number): [number, number] {
    let steps = 0;
    const end = t + durationMs;
    while (t < end) {
      t += frameMs;
      if (a.sample(frameMs, t)) steps++;
    }
    return [steps, t];
  }

  it('ignores everything during warm-up', () => {
    const a = new AdaptiveQuality();
    a.reset(0);
    const [steps] = run(a, 40, o.warmupMs - 50, 0);
    expect(steps).toBe(0);
    expect(a.state).toBe('warmup');
  });

  it('steps down once after sustained misses, then cools down', () => {
    const a = new AdaptiveQuality();
    a.reset(0);
    const [steps, t] = run(a, 25, o.warmupMs + 2000 + o.sustainMs + 500, 0);
    expect(steps).toBe(1);
    expect(a.state).toBe('cooldown');
    // Still slow during the cooldown: no second step.
    const [more] = run(a, 25, o.cooldownMs - 200, t);
    expect(more).toBe(0);
  });

  it('a short burst of slow frames never steps down', () => {
    const a = new AdaptiveQuality();
    a.reset(0);
    const [warm, t1] = run(a, 16, o.warmupMs + 2000, 0);
    const [burst, t2] = run(a, 30, 1000, t1);
    const [after] = run(a, 16, 5000, t2);
    expect(warm + burst + after).toBe(0);
  });

  it('hysteresis: a miss ratio between exit and enter keeps the current state', () => {
    const a = new AdaptiveQuality({ ...o, sustainMs: 1e9 });
    a.reset(0);
    let t = 0;
    // Healthy window first.
    for (let i = 0; i < 300; i++) a.sample(16, (t += 16));
    expect(a.state).toBe('ok');
    // 20% misses (between 10% exit and 30% enter): stays ok.
    for (let i = 0; i < 400; i++) a.sample(i % 5 === 0 ? 30 : 16, (t += 16));
    expect(a.state).toBe('ok');
    // 50% misses: enters struggling.
    for (let i = 0; i < 200; i++) a.sample(i % 2 === 0 ? 30 : 16, (t += 16));
    expect(a.state).toBe('struggling');
    // Back to 20%: still struggling (does not flip back until <= 10%).
    for (let i = 0; i < 400; i++) a.sample(i % 5 === 0 ? 30 : 16, (t += 16));
    expect(a.state).toBe('struggling');
    // Clean frames: recovers.
    for (let i = 0; i < 200; i++) a.sample(16, (t += 16));
    expect(a.state).toBe('ok');
  });

  it('judges a 30 fps cap against 33 ms, not 16 ms', () => {
    const a = new AdaptiveQuality();
    a.setTargetFps(30);
    a.reset(0);
    const [steps] = run(a, 33.3, 15000, 0);
    expect(steps).toBe(0);
  });

  it('hitches (tab switch, loading) are not counted', () => {
    const a = new AdaptiveQuality();
    a.reset(0);
    const [steps] = run(a, 400, 20000, 0);
    expect(steps).toBe(0);
  });

  it('battery hint: low and discharging suggests saver', () => {
    expect(batterySuggestsSaver(0.15, false)).toBe(true);
    expect(batterySuggestsSaver(0.15, true)).toBe(false);
    expect(batterySuggestsSaver(0.6, false)).toBe(false);
  });
});

describe('FrameLimiter (fps cap by frame skipping)', () => {
  function rendered(cap: 30 | 60 | 0, displayHz: number, seconds: number, jitterMs = 0): number {
    const l = new FrameLimiter(cap);
    const dt = 1000 / displayHz;
    let n = 0;
    for (let i = 0; i < displayHz * seconds; i++) {
      const jitter = jitterMs * Math.sin(i * 12.9898);
      if (l.shouldRender(i * dt + jitter)) n++;
    }
    return n / seconds;
  }

  it('60 fps on a 120 Hz display renders every other frame', () => {
    expect(rendered(60, 120, 10)).toBeCloseTo(60, 0);
  });

  it('60 fps on a 144 Hz display averages 60', () => {
    expect(Math.abs(rendered(60, 144, 10) - 60)).toBeLessThan(1.5);
  });

  it('30 fps on a 60 Hz display renders every other frame, even with vsync jitter', () => {
    expect(rendered(30, 60, 10, 0.6)).toBeCloseTo(30, 0);
  });

  it('60 fps on a 60 Hz display never drops a frame to jitter', () => {
    expect(rendered(60, 60, 10, 0.8)).toBeCloseTo(60, 0);
  });

  it('unlocked renders every callback', () => {
    expect(rendered(0, 120, 5)).toBe(120);
  });

  it('a stall restarts the schedule instead of bursting', () => {
    const l = new FrameLimiter(60);
    expect(l.shouldRender(0)).toBe(true);
    expect(l.shouldRender(5000)).toBe(true);
    expect(l.shouldRender(5008)).toBe(false);
    expect(l.shouldRender(5016.7)).toBe(true);
  });
});

describe('first-launch benchmark', () => {
  it('classifies GPUs', () => {
    expect(classifyGpu('ANGLE (Qualcomm, Adreno (TM) 840, OpenGL ES 3.2)')).toBe('high');
    expect(classifyGpu('Adreno (TM) 750')).toBe('high');
    expect(classifyGpu('Adreno (TM) 650')).toBe('mid');
    expect(classifyGpu('Adreno (TM) 610')).toBe('low');
    expect(classifyGpu('Mali-G715 Immortalis MC11')).toBe('high');
    expect(classifyGpu('Mali-G57 MC2')).toBe('mid');
    expect(classifyGpu('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)')).toBe('software');
    expect(classifyGpu('')).toBe('unknown');
  });

  it('starts high-end and unknown GPUs at Ultra', () => {
    expect(startPresetFor('high')).toBe('ultra');
    expect(startPresetFor('unknown')).toBe('ultra');
    expect(startPresetFor('software')).toBe('low');
  });

  it('percentile uses nearest rank', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90)).toBe(9);
    expect(percentile([], 90)).toBe(Infinity);
  });

  it('an S26 Ultra-class GPU holding 60 fps lands on Ultra in one run', () => {
    const p = new BenchmarkPlanner('high');
    const frames = Array.from({ length: 50 }, (_, i) => (i % 10 === 0 ? 19 : 9));
    p.report(frames, 700);
    expect(p.done).toBe(true);
    expect(p.chosen).toBe('ultra');
  });

  it('steps down until a preset holds 60 fps', () => {
    const p = new BenchmarkPlanner('unknown');
    p.report(Array(30).fill(30), 700);
    expect(p.candidate).toBe('high');
    p.report(Array(30).fill(15), 1400);
    expect(p.chosen).toBe('high');
  });

  it('runs out of time: picks the next lower preset without another run', () => {
    const p = new BenchmarkPlanner('unknown', 1500);
    p.report(Array(30).fill(30), 1000);
    expect(p.chosen).toBe('high');
  });

  it('too few frames is a failed run', () => {
    expect(runPasses([10, 10], 'high')).toBe(false);
  });
});

describe('shadow fitting math', () => {
  it('the frustum-slice sphere contains every corner of the slice', () => {
    const fov = 42;
    const aspect = 2.16;
    const near = 0.5;
    const far = 120;
    const { radius, centerZ } = frustumSliceSphere(fov, aspect, near, far);
    const t = Math.tan(((fov / 2) * Math.PI) / 180);
    for (const z of [near, far]) {
      const h = z * t;
      const w = h * aspect;
      const d = Math.sqrt(w * w + h * h + (z - centerZ) * (z - centerZ));
      expect(d).toBeLessThanOrEqual(radius + 1e-6);
    }
    // Tight: the far corners touch the sphere.
    const hf = far * t;
    expect(Math.sqrt(hf * hf * (1 + aspect * aspect) + (far - centerZ) ** 2)).toBeCloseTo(radius, 5);
  });

  it('texel size shrinks with map size (Ultra 4x sharper than Medium)', () => {
    expect(shadowTexelSize(100, 1024) / shadowTexelSize(100, 4096)).toBe(4);
  });
});

describe('era grading palettes', () => {
  it('stay within gentle, valid ranges', () => {
    for (const g of Object.values(ERA_GRADES)) {
      for (const v of [...g.lift]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [...g.lift]) expect(v).toBeLessThan(0.05);
      for (const v of [...g.gamma, ...g.gain]) expect(v).toBeGreaterThan(0.8);
      for (const v of [...g.gamma, ...g.gain]) expect(v).toBeLessThan(1.2);
      expect(g.saturation).toBeGreaterThan(0.6);
      expect(g.saturation).toBeLessThan(1.3);
      expect(g.vignette).toBeLessThanOrEqual(0.5);
    }
  });
});
