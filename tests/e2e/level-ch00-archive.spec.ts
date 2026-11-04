import { expect, test, type Page } from '@playwright/test';
import { applyCpuThrottle } from './helpers/throttle';

/**
 * "The Archive at Night" (Prologue mission 1), controller only (mocked navigator.getGamepads):
 * walk in, light the lamp, open the drawer, scan the ledger, open the codex, read the document
 * in the 3D viewer, look through both lenses, pause + save, sort the three label cards and open
 * the glowing document into the debrief. Zero console errors or warnings.
 */

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;
const A = 0;
const B = 1;
const X = 2;
const SELECT = 8;
const LEFT = 14;
const PRESET = process.env.NETIVIM_PRESET ?? '';
const SHOTS = PRESET !== '';

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

interface PadState {
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

test.beforeEach(async ({ page }) => {
  // E2E_CPU_THROTTLE=<rate> emulates the slow CI machine (helpers/throttle.ts).
  await applyCpuThrottle(page);
  await page.addInitScript(() => {
    const pad = {
      id: 'Xbox Wireless Controller (Vendor: 045e)',
      index: 0,
      connected: true,
      mapping: 'standard',
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
      axes: [0, 0, 0, 0],
    };
    (window as unknown as { __pad: unknown }).__pad = pad;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
  });
});

const ACTION_OF: Readonly<Record<number, string>> = { 0: 'confirm', 1: 'back', 2: 'interact', 8: 'map', 14: 'left', 15: 'right' };

async function setButton(page: Page, index: number, pressed: boolean): Promise<void> {
  await page.evaluate(
    ([i, p]) => {
      const pad = (window as unknown as { __pad: PadState }).__pad;
      const b = pad.buttons[i as number];
      if (b) {
        b.pressed = p as boolean;
        b.value = p ? 1 : 0;
      }
    },
    [index, pressed] as const,
  );
}

/** Test-side marker in the recorder log (no-op until installRecorder ran). */
const mark = (page: Page, what: string): Promise<void> =>
  page.evaluate((m) => {
    (window as unknown as { __rec?: unknown[] }).__rec?.push({ kind: 'test', t: Math.round(performance.now()), what: m });
  }, what);

const isDown = (page: Page, action: string): Promise<boolean> => page.evaluate((a) => window.__netivim?.input.isDown(a as 'confirm') ?? false, action);

/** One press, held until a simulation step has seen it, released until a step has seen that. */
async function press(page: Page, index: number): Promise<void> {
  const action = ACTION_OF[index] ?? 'confirm';
  await mark(page, 'press ' + action);
  await setButton(page, index, true);
  await expect.poll(() => isDown(page, action), { timeout: 30000 }).toBe(true);
  await setButton(page, index, false);
  await expect.poll(() => isDown(page, action), { timeout: 30000 }).toBe(false);
  await page.waitForTimeout(200);
}

async function setStick(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([ax, ay]) => {
      const pad = (window as unknown as { __pad: PadState }).__pad;
      pad.axes[0] = ax as number;
      pad.axes[1] = ay as number;
    },
    [x, y] as const,
  );
}

interface Probe {
  x: number;
  z: number;
  yaw: number;
}
const probe = (page: Page): Promise<Probe> =>
  page.evaluate(() => {
    const p = window.__netivimGameplay?.host?.level?.player;
    return { x: p?.x ?? 0, z: p?.z ?? 0, yaw: p?.cameraYaw ?? 0 };
  });
const missionState = (page: Page): Promise<string | undefined> => page.evaluate(() => window.__netivimGameplay?.host?.state);

/** Steers the left stick toward a world point until within `within` meters (same math as the QA bot). */
/** Last walk target, so interact() can step back into reach after slow-frame drift. */
let lastTarget: { x: number; z: number; within: number } | null = null;

async function walkTo(page: Page, tx: number, tz: number, within = 0.5): Promise<void> {
  lastTarget = { x: tx, z: tz, within };
  const dist = (p: Probe): number => Math.hypot(tx - p.x, tz - p.z);
  let end = await probe(page);
  // On slow frames the walker reads a stale position and the stick release lands late, so it
  // can coast well past the target (CI: 1.2 m past case B, nearer to case C). After each
  // approach, wait until the player has stopped and re-check; walk back if it overshot.
  for (let attempt = 0; attempt < 6; attempt++) {
    for (let i = 0; i < 400; i++) {
      const p = await probe(page);
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d <= within) break;
      if (i === 399) throw new Error('walkTo gave up at ' + JSON.stringify(p) + ' toward ' + String(tx) + ',' + String(tz));
      const fwd = (dx / d) * Math.sin(p.yaw) + (dz / d) * Math.cos(p.yaw);
      const right = (dx / d) * -Math.cos(p.yaw) + (dz / d) * Math.sin(p.yaw);
      // Gentler on later attempts (an overshoot means the frames are slow), but always above
      // the stick dead zone (0.2) so the walker never stalls just outside the target.
      const s = Math.max(0.3, Math.min(1, d / (1.5 * (attempt + 1))));
      await setStick(page, right * s, -fwd * s);
      await page.waitForTimeout(80);
    }
    await setStick(page, 0, 0);
    await page.waitForTimeout(250);
    end = await probe(page);
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(150);
      const next = await probe(page);
      const moved = Math.hypot(next.x - end.x, next.z - end.z);
      end = next;
      if (moved < 0.01) break;
    }
    if (dist(end) <= within) break;
  }
  await mark(page, 'walked to ' + String(tx) + ',' + String(tz) + ' at ' + end.x.toFixed(2) + ',' + end.z.toFixed(2));
}

/** Presses interact until `done()` holds (slow software frames can swallow a press). */
async function interact(page: Page, done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 6; i++) {
    // A previous press may have landed late on a slow frame: never press again once it worked
    // (a second press can, e.g., switch the lens inside the sheet it just opened).
    if (await done()) return;
    // Software-GL frames can be slow enough that the walker drifts out of reach after the stick
    // is released: only press when the interaction prompt shows, else walk back first.
    if (lastTarget && !(await visible(page, '.gp-hud__prompt'))) {
      const t = lastTarget;
      await walkTo(page, t.x, t.z, Math.max(0.25, t.within * 0.6));
      lastTarget = t;
    }
    await press(page, X);
    for (let j = 0; j < 30; j++) {
      if (await done()) return;
      await page.waitForTimeout(200);
    }
  }
}
const progressFlag = (page: Page, flag: string): Promise<boolean> =>
  page.evaluate((f) => {
    const lv = window.__netivimGameplay?.host?.level as unknown as { qa?: { progress: Record<string, boolean> } } | undefined;
    return lv?.qa?.progress[f] ?? false;
  }, flag);
/** The display case whose sheet is open (null: no case sheet). */
const openCase = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const qa = (window.__netivimGameplay?.host?.level as unknown as { qa?: { modal: string; activeCase: string | null } } | undefined)?.qa;
    return qa?.modal === 'case' ? qa.activeCase : null;
  });
const visible = async (page: Page, sel: string): Promise<boolean> => page.locator(sel).first().isVisible();

/**
 * Diagnostics for slow-frame failures: records every input update and mission step (confirm
 * down / justPressed, modal, activeCase, justOpened, warm-up hold, mission sim time).
 */
async function installRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface Rec { kind: string; t: number; [k: string]: unknown }
    const w = window as unknown as { __rec?: Rec[]; __recOn?: boolean };
    if (w.__recOn) return;
    w.__recOn = true;
    const log: Rec[] = (w.__rec = []);
    const push = (r: Rec): void => {
      log.push(r);
      if (log.length > 600) log.shift();
    };
    const game = window.__netivim;
    const director = window.__netivimGameplay;
    if (!game || !director) return;
    const input = game.input;
    const held = (): boolean => {
      const scene = director.host?.level?.scene.scene;
      return !!scene && !!window.__netivimPipeline?.holdsSimulation(scene);
    };
    // Event log, not a per-step log: presses, holds and modal changes only.
    let last = '';
    let inputs = 0;
    let hostSteps = 0;
    const origInput = input.update.bind(input);
    input.update = () => {
      origInput();
      inputs++;
      const h = held();
      const key = String(input.isDown('confirm')) + String(input.isDown('interact')) + String(h);
      if (key !== last || input.justPressed('confirm') || input.justPressed('interact')) {
        last = key;
        push({ kind: 'input', t: Math.round(performance.now()), n: inputs, hostSteps, down: input.isDown('confirm'), jp: input.justPressed('confirm'), downX: input.isDown('interact'), jpX: input.justPressed('interact'), held: h });
      }
    };
    const host = director.host;
    if (!host) return;
    let lastHost = '';
    const origHost = host.update.bind(host);
    host.update = (dt: number) => {
      const jp = input.justPressed('confirm') || input.justPressed('interact');
      origHost(dt);
      hostSteps++;
      const lv = host.level as unknown as { qa?: { modal: string; activeCase: string | null; justOpened: boolean }; player?: { x: number; z: number } } | null;
      const qa = lv?.qa;
      const key = String(qa?.modal) + String(qa?.activeCase) + String(qa?.justOpened);
      if (key !== lastHost || jp) {
        lastHost = key;
        push({ kind: 'host', t: Math.round(performance.now()), n: inputs, sim: Math.round(host.simTime * 1000) / 1000, modal: qa?.modal, activeCase: qa?.activeCase, justOpened: qa?.justOpened, x: Math.round((lv?.player?.x ?? 0) * 100) / 100, z: Math.round((lv?.player?.z ?? 0) * 100) / 100 });
      }
    };
  });
}

async function dumpDiagnostics(page: Page, label: string): Promise<void> {
  const d = await page.evaluate(() => {
    const director = window.__netivimGameplay;
    const host = director?.host;
    const qa = (host?.level as unknown as { qa?: { modal: string; activeCase: string | null; justOpened: boolean; progress: unknown } } | null)?.qa;
    const scene = host?.level?.scene.scene;
    return {
      modal: qa?.modal,
      activeCase: qa?.activeCase,
      justOpened: qa?.justOpened,
      progress: qa?.progress,
      holdsSimulation: scene ? window.__netivimPipeline?.holdsSimulation(scene) : null,
      sceneReady: scene ? window.__netivimPipeline?.sceneReady(scene) : null,
      simTime: host?.simTime,
      state: host?.state,
      fps: window.__netivimPipeline?.stats.fps,
      rec: (window as unknown as { __rec?: unknown[] }).__rec,
    };
  });
  console.log('[archive diagnostics] ' + label + ' ' + JSON.stringify(d));
}

async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: 'test-results/archive-' + name + '.png' });
}

test('controller only: the whole Archive at Night tutorial, to the debrief', async ({ page }) => {
  test.setTimeout(420000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
  // A preset (NETIVIM_PRESET) only when taking screenshots (software WebGL is very slow at that preset).
  await page.evaluate((ultra) => {
    if (ultra) window.__netivim?.settings.update('graphics', { mode: 'preset', preset: ultra as 'high' });
    window.__netivim?.flow.send('openHub');
  }, PRESET);
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('prologue', false));
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('briefing');
  await press(page, A);
  await expect.poll(() => missionState(page), { timeout: 60000 }).toBe('arrival');
  await expect(page.locator('.gp-hud__objective')).toHaveText('היכנסו לארכיון');
  await expect(page.locator('.an-banner')).toContainText('הזיזו');
  await shot(page, '1-porch');

  // Arrival: walk through the door.
  await walkTo(page, 0, -4.2, 0.8);
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('reading_room');

  // Step fully through the doorway first: the arrival trigger can fire while the walker is still
  // just outside, and a straight line to the lamp would then press into the outer wall.
  await walkTo(page, 0, -1.5, 0.5);

  // Reading room: lamp, then drawer.
  await walkTo(page, 6, 1.5, 0.4);
  await expect(page.locator('.gp-hud__prompt')).toBeVisible({ timeout: 30000 });
  await interact(page, () => progressFlag(page, 'lamp'));
  await shot(page, '2-lamp');
  await walkTo(page, -6.5, 1.5, 0.4);
  await interact(page, () => progressFlag(page, 'drawer'));
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('codex_ledger');

  // Ledger, then the codex.
  await walkTo(page, 3, 4.8, 0.8);
  await walkTo(page, 6.2, 7.4, 0.4);
  await interact(page, () => progressFlag(page, 'ledger'));
  await expect(page.locator('.an-banner')).toContainText('הקודקס');
  await press(page, SELECT);
  await expect(page.locator('.an-sheet')).toContainText('רכבת יפו');
  await shot(page, '3-codex');
  await press(page, A);
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('first_document');

  // The locked cabinet: 3D viewer with the provenance card.
  await walkTo(page, 0, 10.8, 0.8);
  await walkTo(page, -7, 12.9, 0.4);
  await interact(page, () => visible(page, '.gp-provenance'));
  await expect(page.locator('.gp-provenance')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.gp-provenance .gp-label')).toHaveText('מתועד');
  await page.waitForTimeout(7000);
  await shot(page, '4-viewer');
  if (process.env.NETIVIM_STOP === 'viewer') return;
  await press(page, A);
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('shelf_tour');

  // Label tour: three display cases (documented, composite, reconstructed), then the reflection.
  await installRecorder(page);
  await walkTo(page, -5.2, 6.4, 0.8);
  for (const [x, z, flag] of [[-6.6, 5.6, 'caseA'], [-6.6, 8.2, 'caseB'], [-6.6, 10.6, 'caseC']] as const) {
    await walkTo(page, x, z, 0.4);
    // Wait for THIS case's sheet, not any sheet: standing between two cases opens the nearer one.
    await interact(page, async () => (await openCase(page)) === flag);
    expect(await openCase(page), 'the sheet open at ' + flag).toBe(flag);
    // One A press closes the case sheet and marks the case seen, at any frame rate.
    await press(page, A);
    const marked = await expect
      .poll(() => progressFlag(page, flag), { timeout: 15000 })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    if (!marked) await dumpDiagnostics(page, flag);
    expect(await progressFlag(page, flag)).toBe(true);
    // The next case's interact check looks for a visible sheet: wait until this one is gone.
    if (flag !== 'caseC') await expect(page.locator('.an-sheet')).toBeHidden({ timeout: 30000 });
  }
  await expect(page.locator('.an-sheet')).toContainText('רגע של מחשבה', { timeout: 30000 });
  await press(page, A);
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('lenses');

  // Two Lenses.
  await walkTo(page, -5.2, 8.2, 0.6);
  await walkTo(page, -3.4, 8.2, 0.4);
  await interact(page, () => visible(page, '.an-sheet'));
  await expect(page.locator('.an-sheet')).toContainText('העדשה של נועה');
  await press(page, A);
  await walkTo(page, -1.6, 8.2, 0.4);
  await interact(page, () => visible(page, '.an-sheet'));
  await expect(page.locator('.an-sheet')).toContainText('מה שמוסכם');
  await shot(page, '5-lenses');
  await press(page, A);
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('labels_table');

  // Pause and save (the table asks for it first), then sort the cards.
  await walkTo(page, 0, 8.2, 0.6);
  await walkTo(page, 2, 11.2, 0.4);
  await press(page, X);
  await expect(page.locator('.an-stage:not([hidden])')).toHaveCount(0);
  await page.evaluate(() => window.__netivim?.flow.setPaused(true));
  expect(await page.evaluate(() => window.__netivim?.save.saveManual('manual-1'))).toBe(true);
  await page.evaluate(() => window.__netivim?.flow.setPaused(false));
  await page.waitForTimeout(300);
  await interact(page, () => visible(page, '.an-sheet'));
  await expect(page.locator('.an-sheet')).toContainText('שייכו כל כרטיס');
  await shot(page, '6-labels');
  await press(page, A); // pick the Basel card
  await press(page, A); // documented tray
  await press(page, A); // pick the guides card
  await press(page, LEFT); // RTL: left is "next"
  await press(page, LEFT);
  await press(page, A); // composite tray
  await press(page, A); // pick the Jaffa card
  await press(page, LEFT);
  await press(page, A); // reconstructed tray
  await expect.poll(() => missionState(page), { timeout: 30000 }).toBe('document_opens');

  // The document opens: finale, then the debrief.
  await walkTo(page, 2, 11.2, 0.4);
  await press(page, X);
  await page.waitForTimeout(3500);
  await shot(page, '7-glow');
  // The chapter's opening cutscene plays between the mission and its debrief (it is registered
  // when the chapter opens, whichever way the player got there).
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('cutscene');
  await page.evaluate(() => window.__netivimCinematics?.player.skip());
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('debrief');
  const done = await page.evaluate(() => {
    const s = window.__netivim?.save.load('auto');
    return s ? { completed: s.data.completedMissions, codex: s.data.unlocks.codex, archive: s.data.unlocks.archive } : null;
  });
  expect(done?.completed).toContain('archive-at-night');
  expect(done?.codex).toContain('jaffa-jerusalem-railway');
  expect(done?.archive).toContain('basel-program');
  void B;
  await page.waitForTimeout(300);
  expect(problems).toEqual([]);
});
