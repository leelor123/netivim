import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import type { BotStep } from '../../src/gameplay/types';
import { boot, enterHub, enterMission, MISSIONS, setPreset, watchConsole } from '../perf/helpers';

/**
 * 30-minute soak (BRIEF 6: "a 30-minute soak test with flat geometry and texture counts").
 * Fast-forwards the real game (real scenes, real renderer, real post chain) through every Prologue
 * and Chapter 1 mission again and again: each mission is entered through the director, driven by
 * its own bot script on a mocked gamepad one fixed step at a time (game.loop.advance), rendered
 * between chunks, then left for the hub. After every hub visit the GPU resource counts and the
 * JS heap (after GC) are recorded. Cycle 1 is the baseline (cycle 0 fills one-time caches).
 *   npm run build:test && PW_PORT=4178 npx playwright test -c tests/perf/playwright.config.ts soak
 * SOAK_MINUTES (default 30) = simulated minutes; SOAK_MISSION_SECONDS (default 120) per visit.
 * Report: test-results/perf/soak.json.
 */

const SOAK_MINUTES = Number(process.env.SOAK_MINUTES ?? 30);
const MISSION_SECONDS = Number(process.env.SOAK_MISSION_SECONDS ?? 120);
const CHUNK_SECONDS = 10;
const HEAP_SLACK_MB = Number(process.env.SOAK_HEAP_SLACK_MB ?? 8);

// Small canvas: software GL renders the Ultra chain in reasonable time; counts do not depend on size.
test.use({ viewport: { width: 480, height: 240 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const pad = {
      id: 'Xbox Wireless Controller (Vendor: 045e)',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: unknown }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
});

interface DriveState {
  readonly sim: number;
  readonly phase: string;
  readonly stopped: string;
}

/**
 * Runs up to `seconds` of simulation with the level's bot script (walkTo / wait / waitFor / press /
 * do). A 'choose' or 'plan' step (UI dialogs) or a failure ends the visit early: the soak measures
 * memory, not completion (completion is the solvability and E2E suites' job).
 */
async function drive(page: Page, seconds: number): Promise<DriveState> {
  return page.evaluate((secs) => {
    interface Pad {
      buttons: { pressed: boolean; value: number }[];
      axes: number[];
    }
    interface Ctx {
      cp: string;
      queue: BotStep[];
      t: number;
      stopped: string;
    }
    const w = window as unknown as { __pad: Pad; __soak?: Ctx };
    const g = window.__netivim;
    const gp = window.__netivimGameplay;
    if (!g || !gp) throw new Error('test hooks missing');
    const ctx: Ctx = (w.__soak ??= { cp: '', queue: [], t: 0, stopped: '' });
    const BTN: Record<string, number> = { confirm: 0, back: 1, interact: 2, alt: 3, tabPrev: 4, tabNext: 5, map: 8, up: 12, down: 13, left: 14, right: 15 };
    const pad = w.__pad;
    const DT = 1 / 60;
    let sim = 0;
    const release = (): void => {
      for (const b of pad.buttons) {
        b.pressed = false;
        b.value = 0;
      }
      pad.axes[0] = 0;
      pad.axes[1] = 0;
    };
    while (sim < secs && !ctx.stopped) {
      const host = gp.host;
      if (!host || g.flow.state !== 'mission') {
        ctx.stopped = 'flow ' + g.flow.state;
        break;
      }
      if (host.phase === 'failed' || host.phase === 'complete' || host.phase === 'decision') {
        ctx.stopped = 'phase ' + host.phase;
        break;
      }
      if (host.checkpoint !== ctx.cp) {
        ctx.cp = host.checkpoint;
        ctx.queue = [...((host.def.botScript as Record<string, readonly BotStep[]>)[ctx.cp] ?? [])];
        ctx.t = 0;
      }
      release();
      const step = ctx.queue[0];
      const level = host.level;
      const p = level?.player;
      let done = false;
      if (step && level) {
        ctx.t += DT;
        if (step.kind === 'walkTo' && p) {
          const dx = step.x - p.x;
          const dz = step.z - p.z;
          const d = Math.hypot(dx, dz);
          if (d <= (step.within ?? 0.6) || ctx.t > (step.timeout ?? 60)) done = true;
          else {
            const yaw = p.cameraYaw;
            const fwd = (dx / d) * Math.sin(yaw) + (dz / d) * Math.cos(yaw);
            const right = (dx / d) * -Math.cos(yaw) + (dz / d) * Math.sin(yaw);
            const s = Math.min(1, d / 1.5);
            pad.axes[0] = right * s;
            pad.axes[1] = -fwd * s;
          }
        } else if (step.kind === 'wait') done = ctx.t >= step.seconds;
        else if (step.kind === 'waitFor') done = host.state === step.state || ctx.t > (step.timeout ?? 120);
        else if (step.kind === 'press') {
          const b = pad.buttons[BTN[step.action] ?? 2];
          if (b) {
            b.pressed = true;
            b.value = 1;
          }
          done = true;
        } else if (step.kind === 'do') {
          step.run(level);
          done = true;
        } else {
          ctx.stopped = 'ui step ' + step.kind;
          break;
        }
      } else if (!step) {
        ctx.stopped = 'script end';
        break;
      }
      g.loop.advance(DT);
      sim += DT;
      if (done) {
        ctx.queue.shift();
        ctx.t = 0;
      }
    }
    release();
    return { sim, phase: gp.host?.phase ?? 'none', stopped: ctx.stopped };
  }, seconds);
}

interface Counts {
  geometries: number;
  textures: number;
  programs: number;
  heapMB: number;
  calls: number;
}

async function counts(page: Page): Promise<Counts> {
  // A few rendered frames so the counters describe the current scene, then GC for the heap.
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.ready), { timeout: 120000 }).toBe(true);
  await page.waitForTimeout(1500);
  return page.evaluate(() => {
    const p = window.__netivimGraphics?.pipeline;
    const info = window.__netivim?.renderer.info;
    (window as unknown as { gc?: () => void }).gc?.();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      geometries: info?.memory.geometries ?? -1,
      textures: info?.memory.textures ?? -1,
      programs: info?.programs?.length ?? -1,
      heapMB: mem ? mem.usedJSHeapSize / 1048576 : 0,
      calls: p?.stats.calls ?? 0,
    };
  });
}

test('soak: 30 simulated minutes through every Prologue and Chapter 1 mission, resources stay flat', async ({ page }) => {
  test.setTimeout(3_600_000);
  const problems = watchConsole(page);
  await boot(page);
  await setPreset(page, (process.env.SOAK_PRESET ?? 'ultra') as 'ultra');
  const hubVisits: (Counts & { cycle: number; after: string; sim: number })[] = [];
  const missionVisits: (Counts & { cycle: number; mission: string; drove: number; stopped: string; longTasks: number; longestTaskMs: number })[] = [];
  let total = 0;
  let cycle = 0;
  await enterHub(page);
  hubVisits.push({ cycle: -1, after: 'boot', sim: 0, ...(await counts(page)) });
  while (total < SOAK_MINUTES * 60) {
    for (const m of MISSIONS) {
      await enterMission(page, m);
      await page.evaluate(() => {
        delete (window as unknown as { __soak?: unknown }).__soak;
        (window as unknown as { __perfLongTasks: number[] }).__perfLongTasks.length = 0;
      });
      let drove = 0;
      let state: DriveState = { sim: 0, phase: 'running', stopped: '' };
      while (drove < MISSION_SECONDS && !state.stopped) {
        state = await drive(page, Math.min(CHUNK_SECONDS, MISSION_SECONDS - drove));
        drove += state.sim;
        // Let the real loop render a few frames of the new position.
        await page.waitForTimeout(150);
        if (state.sim === 0) break;
      }
      // Idle the rest of the visit's game time if the script stopped early (still simulated).
      if (drove < MISSION_SECONDS && state.phase === 'running') {
        await page.evaluate((s) => {
          const g = window.__netivim;
          for (let i = 0; i < s * 60; i++) g?.loop.advance(1 / 60);
        }, MISSION_SECONDS - drove);
        drove = MISSION_SECONDS;
      }
      total += drove;
      const long = await page.evaluate(() => (window as unknown as { __perfLongTasks: number[] }).__perfLongTasks.slice());
      missionVisits.push({
        cycle,
        mission: m.key,
        drove,
        stopped: state.stopped,
        longTasks: long.length,
        longestTaskMs: long.reduce((a, b) => Math.max(a, b), 0),
        ...(await counts(page)),
      });
      await enterHub(page);
      hubVisits.push({ cycle, after: m.key, sim: total, ...(await counts(page)) });
      if (total >= SOAK_MINUTES * 60) break;
    }
    cycle++;
  }
  mkdirSync('test-results/perf', { recursive: true });
  writeFileSync('test-results/perf/soak.json', JSON.stringify({ simulatedSeconds: total, cycles: cycle, hubVisits, missionVisits }, null, 2));
  for (const h of hubVisits) console.log('hub after', h.after.padEnd(15), 'cycle', h.cycle, 'geo', h.geometries, 'tex', h.textures, 'prog', h.programs, 'heap', h.heapMB.toFixed(1));
  for (const v of missionVisits) console.log('mission', v.mission.padEnd(15), 'cycle', v.cycle, 'geo', v.geometries, 'tex', v.textures, 'prog', v.programs, 'heap', v.heapMB.toFixed(1), 'drove', v.drove.toFixed(0), v.stopped);

  expect(total).toBeGreaterThanOrEqual(SOAK_MINUTES * 60);
  // Flat: every hub visit after the first full cycle shows exactly the baseline GPU resources.
  const baseline = hubVisits.find((h) => h.cycle === 1) ?? hubVisits[hubVisits.length - 1];
  expect(baseline).toBeDefined();
  if (!baseline) return;
  for (const h of hubVisits.filter((x) => x.cycle >= 1)) {
    expect.soft(h.geometries, 'hub geometries after ' + h.after + ' (cycle ' + String(h.cycle) + ')').toBe(baseline.geometries);
    expect.soft(h.textures, 'hub textures after ' + h.after + ' (cycle ' + String(h.cycle) + ')').toBe(baseline.textures);
    expect.soft(h.programs, 'hub programs after ' + h.after + ' (cycle ' + String(h.cycle) + ')').toBeLessThanOrEqual(baseline.programs);
  }
  // Heap: the hub heap right after a mission depends on whether the last level was still
  // reachable at that GC (it is freed by the next scene switch; see docs/PERF_REPORT.md), so a
  // single visit is noisy by up to ~20 MB. A leak raises the FLOOR: the lowest hub heap of every
  // cycle must stay within HEAP_SLACK_MB of cycle 1's.
  const floor = (c: number): number => Math.min(...hubVisits.filter((x) => x.cycle === c).map((x) => x.heapMB));
  for (let c = 2; c < cycle; c++) {
    if (hubVisits.some((x) => x.cycle === c)) expect.soft(floor(c) - floor(1), 'JS heap floor growth, cycle ' + String(c) + ' vs 1 (MB)').toBeLessThanOrEqual(HEAP_SLACK_MB);
  }
  // Each mission holds the same GPU resources on every visit (cycle 1 is the baseline: cycle 0
  // uploads the first-ever variants).
  for (const m of MISSIONS) {
    const visits = missionVisits.filter((v) => v.mission === m.key && v.cycle >= 1);
    const first = visits[0];
    if (!first) continue;
    for (const v of visits) {
      expect.soft(v.geometries, m.key + ' geometries, cycle ' + String(v.cycle)).toBe(first.geometries);
      expect.soft(v.textures, m.key + ' textures, cycle ' + String(v.cycle)).toBe(first.textures);
    }
  }
  expect(problems).toEqual([]);
});
