import { expect, type Page } from '@playwright/test';
import type { GraphicsPreset } from '../../src/core/settings';

/** Ignored console noise from software GL. */
const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

export const PRESETS: readonly GraphicsPreset[] = ['battery', 'low', 'medium', 'high', 'ultra'];

/** Every Prologue and Chapter 1 mission: chapter, missions completed before it, mission id. */
export interface MissionTarget {
  readonly key: string;
  readonly chapter: 'prologue' | 'ch01';
  readonly before: readonly string[];
  readonly missionId: string;
}

export const MISSIONS: readonly MissionTarget[] = [
  { key: 'archive-night', chapter: 'prologue', before: [], missionId: 'archive-at-night' },
  { key: 'jaffa-letters', chapter: 'prologue', before: ['archive-at-night'], missionId: 'letters-from-jaffa' },
  { key: 'tower-stockade', chapter: 'ch01', before: [], missionId: 'tower-and-stockade' },
  { key: 'night-landing', chapter: 'ch01', before: ['tower-and-stockade'], missionId: 'night-landing' },
  { key: 'the-vote', chapter: 'ch01', before: ['tower-and-stockade', 'night-landing'], missionId: 'the-vote' },
];

export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

/** Loads the game, waits for the title, installs a long-task observer and a frame recorder. */
export async function boot(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __perfLongTasks: number[] };
    w.__perfLongTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__perfLongTasks.push(e.duration);
      }).observe({ type: 'longtask', buffered: true });
    } catch {
      // longtask not supported: the array stays empty.
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 120000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay && !!window.__netivimGraphics), { timeout: 120000 }).toBe(true);
  await page.evaluate(() => {
    window.__netivimGraphics?.setAdaptiveEnabled(false);
    // A frame recorder that allocates nothing per frame (ring of 4096 frame times).
    const rec = { times: new Float64Array(4096), count: 0, maxCalls: 0, maxTris: 0 };
    (window as unknown as { __perfRec: typeof rec }).__perfRec = rec;
    const p = window.__netivimGraphics?.pipeline;
    p?.addFrameListener((ms) => {
      rec.times[rec.count & 4095] = ms;
      rec.count++;
      if (p.stats.calls > rec.maxCalls) rec.maxCalls = p.stats.calls;
      if (p.stats.triangles > rec.maxTris) rec.maxTris = p.stats.triangles;
    });
  });
}

export async function setPreset(page: Page, preset: GraphicsPreset): Promise<void> {
  await page.evaluate((pr) => {
    window.__netivim?.settings.update('graphics', { mode: 'preset', preset: pr, benchmarked: true });
    window.__netivimGraphics?.setAdaptiveEnabled(false);
  }, preset);
}

/** Opens the hub (flow 'hub'); resolves once the hub scene is the active scene. */
export async function enterHub(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__netivim;
    if (!g) return;
    g.flow.setPaused(false);
    const f = g.flow;
    if (f.state === 'mission' || f.state === 'cutscene') f.send('abandon');
    else if (f.state === 'briefing') f.send('back');
    else if (f.state === 'debrief' || f.state === 'quiz') f.send('toHub');
    else if (f.state === 'title') f.send('openHub');
  });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('hub');
  await expect.poll(() => page.evaluate(() => document.querySelector('.nv-hub-veil') === null), { timeout: 120000 }).toBe(true);
}

interface DirectorInternals {
  run: unknown;
  openBriefing(): Promise<void>;
  enterMission(): void;
}

/**
 * Starts a mission without the UI (director internals: content note and briefing are skipped).
 * Resolves when the mission is running and its level scene is the active scene.
 */
export async function enterMission(page: Page, m: MissionTarget): Promise<void> {
  await enterHub(page);
  await page.evaluate((t) => {
    const g = window.__netivim;
    if (!g) return;
    const s = g.getState();
    g.setState({ ...s, completedMissions: [...t.before], resume: { ...s.resume, mission: null } });
    (window.__netivimGameplay as unknown as { run: unknown }).run = null;
    window.__netivimGameplay?.beginChapter(t.chapter, false);
  }, m);
  await expect.poll(() => page.evaluate(() => (window.__netivimGameplay as unknown as DirectorInternals).run !== null), { timeout: 60000 }).toBe(true);
  await page.evaluate(() => (window.__netivimGameplay as unknown as DirectorInternals).openBriefing());
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('briefing');
  await page.evaluate(() => (window.__netivimGameplay as unknown as DirectorInternals).enterMission());
  await expect.poll(() => page.evaluate(() => window.__netivimGameplay?.host?.phase), { timeout: 120000 }).toBe('running');
  const id = await page.evaluate(() => window.__netivimGameplay?.host?.def.missionId);
  expect(id).toBe(m.missionId);
}

export interface FrameSample {
  readonly frames: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly calls: number;
  readonly maxCalls: number;
  readonly triangles: number;
  readonly maxTriangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly programs: number;
  readonly heapMB: number;
  readonly longTasks: number;
  readonly longestTaskMs: number;
  readonly composer: boolean;
  readonly width: number;
  readonly height: number;
}

/** Waits for the pipeline to be ready, warms up, then records `ms` of frames. */
export async function sample(page: Page, ms: number, warmupMs = 1500): Promise<FrameSample> {
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.ready), { timeout: 120000 }).toBe(true);
  await page.waitForTimeout(warmupMs);
  await page.evaluate(() => {
    const w = window as unknown as { __perfRec: { count: number; maxCalls: number; maxTris: number }; __perfLongTasks: number[] };
    w.__perfRec.count = 0;
    w.__perfRec.maxCalls = 0;
    w.__perfRec.maxTris = 0;
    w.__perfLongTasks.length = 0;
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    const w = window as unknown as {
      __perfRec: { times: Float64Array; count: number; maxCalls: number; maxTris: number };
      __perfLongTasks: number[];
      gc?: () => void;
    };
    const rec = w.__perfRec;
    const n = Math.min(rec.count, rec.times.length);
    const sorted = Array.from(rec.times.subarray(0, n)).sort((a, b) => a - b);
    const q = (f: number): number => sorted[Math.min(n - 1, Math.floor(f * n))] ?? 0;
    const p = window.__netivimGraphics?.pipeline;
    const s = p?.stats;
    w.gc?.();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      frames: rec.count,
      p50: q(0.5),
      p95: q(0.95),
      p99: q(0.99),
      max: sorted[n - 1] ?? 0,
      calls: s?.calls ?? 0,
      maxCalls: rec.maxCalls,
      triangles: s?.triangles ?? 0,
      maxTriangles: rec.maxTris,
      geometries: s?.geometries ?? 0,
      textures: s?.textures ?? 0,
      programs: s?.programs ?? 0,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : 0,
      longTasks: w.__perfLongTasks.length,
      longestTaskMs: w.__perfLongTasks.reduce((a, b) => Math.max(a, b), 0),
      composer: s?.composer ?? false,
      width: s?.width ?? 0,
      height: s?.height ?? 0,
    };
  });
}

/** Scene audit for per-frame program churn sources three.js does not warn about. */
export interface SceneAudit {
  /** transparent + DoubleSide + !forceSinglePass: three draws them in two passes and flips needsUpdate twice per frame. */
  readonly twoPassTransparent: string[];
  /** Materials drawn by both InstancedMesh and plain meshes: the program variant flips during the frame. */
  readonly mixedInstancing: string[];
  readonly instancedCasters: number;
  readonly meshes: number;
  readonly frustumCullingOff: number;
}

export async function auditScene(page: Page): Promise<SceneAudit> {
  return page.evaluate(() => {
    const sc = window.__netivim?.scenes.active?.scene;
    const two = new Set<string>();
    const use = new Map<object, { inst: number; plain: number; label: string }>();
    let instancedCasters = 0;
    let meshes = 0;
    let noCull = 0;
    sc?.traverse((o) => {
      const mesh = o as unknown as { isMesh?: boolean; isInstancedMesh?: boolean; material?: unknown; frustumCulled: boolean; castShadow: boolean; name: string };
      if (!mesh.isMesh) return;
      meshes++;
      if (!mesh.frustumCulled) noCull++;
      if (mesh.isInstancedMesh && mesh.castShadow) instancedCasters++;
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as { transparent: boolean; side: number; forceSinglePass: boolean; type: string; name: string; color?: { getHexString(): string } }[];
      for (const m of mats) {
        if (!m) continue;
        const label = m.type + (m.name ? ':' + m.name : '') + (m.color ? '#' + m.color.getHexString() : '') + ' on ' + (o.name || o.type);
        if (m.transparent && m.side === 2 && !m.forceSinglePass) two.add(label);
        const u = use.get(m) ?? { inst: 0, plain: 0, label };
        if (mesh.isInstancedMesh) u.inst++;
        else u.plain++;
        use.set(m, u);
      }
    });
    const mixed = [...use.values()].filter((u) => u.inst > 0 && u.plain > 0).map((u) => u.label + ' (' + String(u.inst) + ' instanced, ' + String(u.plain) + ' plain)');
    return { twoPassTransparent: [...two], mixedInstancing: mixed, instancedCasters, meshes, frustumCullingOff: noCull };
  });
}
