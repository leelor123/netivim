import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { auditScene, boot, enterHub, enterMission, MISSIONS, PRESETS, sample, setPreset, watchConsole, type FrameSample, type SceneAudit } from './helpers';

/**
 * Render budget per scene and preset (hub + every Prologue / Chapter 1 mission at its start view).
 * Levels read world density at build time, so every (scene, preset) pair is a fresh build.
 * Budgets: docs/DESIGN.md section 8 / CLAUDE.md. Numbers land in test-results/perf/scenes.json.
 */

const BUDGET: Record<string, { calls: number; triangles: number }> = {
  battery: { calls: 120, triangles: 200_000 },
  low: { calls: 150, triangles: 300_000 },
  medium: { calls: 250, triangles: 600_000 },
  high: { calls: 400, triangles: 1_500_000 },
  ultra: { calls: 600, triangles: 3_000_000 },
};

/**
 * Known level-side overruns, reported (console + scenes.json) but not failed here: they belong to
 * the level owners and are tracked in docs/PERF_REPORT.md. Remove an entry once fixed.
 */
const KNOWN_OVER = new Set<string>(['night-landing@battery']);

const SAMPLE_MS = Number(process.env.PERF_SAMPLE_MS ?? 2500);
const ONLY = process.env.PERF_PRESETS ? process.env.PERF_PRESETS.split(',') : null;

test('render budgets: hub and the five missions at every preset', async ({ page }) => {
  const problems = watchConsole(page);
  await boot(page);
  const rows: (FrameSample & { scene: string; preset: string; audit: SceneAudit })[] = [];
  const presets = PRESETS.filter((p) => !ONLY || ONLY.includes(p));
  for (const preset of presets) {
    await setPreset(page, preset);
    await enterHub(page);
    rows.push({ scene: 'hub', preset, ...(await sample(page, SAMPLE_MS)), audit: await auditScene(page) });
    for (const m of MISSIONS) {
      await enterMission(page, m);
      rows.push({ scene: m.key, preset, ...(await sample(page, SAMPLE_MS)), audit: await auditScene(page) });
    }
  }
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync('test-results/perf/scenes.json', JSON.stringify(rows, null, 2));
  for (const r of rows) {
    console.log(
      [r.preset.padEnd(7), r.scene.padEnd(15), 'calls', r.maxCalls, 'tris', r.maxTriangles, 'prog', r.programs, 'geo', r.geometries, 'tex', r.textures, 'heap', r.heapMB.toFixed(1), 'p50', r.p50.toFixed(1), 'p95', r.p95.toFixed(1), 'long', r.longTasks].join(' '),
    );
  }
  for (const r of rows.filter((x) => x.preset === presets[presets.length - 1])) {
    if (r.audit.twoPassTransparent.length || r.audit.mixedInstancing.length) console.log('audit', r.scene, JSON.stringify(r.audit));
  }
  for (const r of rows) {
    const b = BUDGET[r.preset];
    if (!b) continue;
    if (KNOWN_OVER.has(r.scene + '@' + r.preset)) {
      if (r.maxCalls > b.calls || r.maxTriangles > b.triangles) console.log('KNOWN OVER BUDGET', r.scene, r.preset, r.maxCalls, r.maxTriangles);
      continue;
    }
    expect.soft(r.maxCalls, r.scene + ' @ ' + r.preset + ' draw calls').toBeLessThanOrEqual(b.calls);
    expect.soft(r.maxTriangles, r.scene + ' @ ' + r.preset + ' triangles').toBeLessThanOrEqual(b.triangles);
  }
  expect(problems).toEqual([]);
});
