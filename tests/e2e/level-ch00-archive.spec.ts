import { expect, test, type Page } from '@playwright/test';

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

const isDown = (page: Page, action: string): Promise<boolean> => page.evaluate((a) => window.__netivim?.input.isDown(a as 'confirm') ?? false, action);

/** One press, held until a simulation step has seen it, released until a step has seen that. */
async function press(page: Page, index: number): Promise<void> {
  const action = ACTION_OF[index] ?? 'confirm';
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
  for (let i = 0; i < 400; i++) {
    const p = await probe(page);
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= within) break;
    if (i === 399) throw new Error('walkTo gave up at ' + JSON.stringify(p) + ' toward ' + String(tx) + ',' + String(tz));
    const fwd = (dx / d) * Math.sin(p.yaw) + (dz / d) * Math.cos(p.yaw);
    const right = (dx / d) * -Math.cos(p.yaw) + (dz / d) * Math.sin(p.yaw);
    const s = Math.min(1, d / 1.5);
    await setStick(page, right * s, -fwd * s);
    await page.waitForTimeout(80);
  }
  await setStick(page, 0, 0);
  await page.waitForTimeout(250);
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
const visible = async (page: Page, sel: string): Promise<boolean> => page.locator(sel).first().isVisible();

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
