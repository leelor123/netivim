import { expect, test, type Page } from '@playwright/test';

/** Same driver-noise filter as core.spec.ts: software WebGL logs its own performance notes. */
const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

interface ViewHandle {
  map: { mapScene: { rig: { azimuth: number; distance: number } } | null };
  close(): void;
}
type Win = { __view?: ViewHandle; __selected?: string; __pads: unknown[] };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__pads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => w.__pads });
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
});

/** Mocked Xbox pad: axes [lx, ly, rx, ry] and a set of pressed button indices (value 1). */
async function setPad(page: Page, axes: [number, number, number, number], pressed: number[] = []): Promise<void> {
  await page.evaluate(
    ({ axes: a, pressed: p }) => {
      const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: p.includes(i), value: p.includes(i) ? 1 : 0 }));
      (window as unknown as Win).__pads = [{ id: 'Xbox Wireless Controller (Vendor: 045e)', index: 0, connected: true, mapping: 'standard', buttons, axes: a }];
    },
    { axes, pressed },
  );
}

async function tapButton(page: Page, button: number): Promise<void> {
  await setPad(page, [0, 0, 0, 0], [button]);
  await page.waitForTimeout(120);
  await setPad(page, [0, 0, 0, 0], []);
  await page.waitForTimeout(120);
}

async function openView(page: Page, completed: string[] = ['prologue', 'ch01']): Promise<void> {
  await page.evaluate((done) => {
    const g = window.__netivim;
    const f = window.__netivimTimeline;
    if (!g || !f) throw new Error('missing test hooks');
    g.setState({ ...g.getState(), completedChapters: done });
    const root = document.createElement('div');
    root.id = 'tl-root';
    document.body.append(root);
    const view = f.openLinked(root, {
      onSelect: (id) => {
        (window as unknown as Win).__selected = id;
      },
    });
    (window as unknown as Win).__view = view as unknown as ViewHandle;
  }, completed);
  await expect(page.locator('[data-screen="timeline"]')).toBeVisible();
  await expect(page.locator('[data-screen="living-map"]')).toBeVisible();
}

const timeline = (page: Page) => page.locator('[data-screen="timeline"]');
const map = (page: Page) => page.locator('[data-screen="living-map"]');
const index = (page: Page) => timeline(page).getAttribute('data-index');

test('timeline is RTL with locked, unlocked and completed chapters', async ({ page }) => {
  const problems = watchConsole(page);
  await openView(page);
  await expect(timeline(page)).toHaveAttribute('dir', 'rtl');
  const nodes = page.locator('.tl-node');
  await expect(nodes).toHaveCount(13);
  await expect(page.locator('.tl-node[data-chapter="prologue"]')).toHaveAttribute('data-status', 'completed');
  await expect(page.locator('.tl-node[data-chapter="ch01"]')).toHaveAttribute('data-status', 'completed');
  await expect(page.locator('.tl-node[data-chapter="ch02"]')).toHaveAttribute('data-status', 'unlocked');
  await expect(page.locator('.tl-node[data-chapter="ch03"]')).toHaveAttribute('data-status', 'locked');
  // Time runs right to left: the prologue sits to the right of chapter 1, and the epilogue is leftmost.
  const x = async (id: string): Promise<number> => ((await page.locator('.tl-node[data-chapter="' + id + '"]').boundingBox())?.x ?? 0);
  expect(await x('prologue')).toBeGreaterThan(await x('ch01'));
  expect(await x('ch01')).toBeGreaterThan(await x('ch02'));
  expect(await x('ch11')).toBeGreaterThan(await x('epilogue'));
  expect(problems).toEqual([]);
});

test('selecting returns the chapter ID; locked chapters do not select', async ({ page }) => {
  await openView(page);
  await page.locator('.tl-node[data-chapter="ch03"]').click({ force: true });
  await expect(page.locator('.tl-status')).toContainText('עדיין בכתיבה');
  expect(await page.evaluate(() => (window as unknown as Win).__selected)).toBeUndefined();
  await page.locator('.tl-node[data-chapter="ch02"]').click();
  expect(await page.evaluate(() => (window as unknown as Win).__selected)).toBe('ch02');
  await expect(timeline(page)).toHaveAttribute('data-index', '2');
});

test('scrubs with the D-pad and the left stick, in reading direction, and the map follows', async ({ page }) => {
  const problems = watchConsole(page);
  await openView(page);
  expect(await index(page)).toBe('0');
  // D-pad left = later in an RTL layout.
  await tapButton(page, 14);
  await expect(timeline(page)).toHaveAttribute('data-index', '1');
  await expect(map(page)).toHaveAttribute('data-era', 'ch01');
  await tapButton(page, 14);
  await expect(timeline(page)).toHaveAttribute('data-index', '2');
  await expect(map(page)).toHaveAttribute('data-era', 'ch02');
  // D-pad right = earlier.
  await tapButton(page, 15);
  await expect(timeline(page)).toHaveAttribute('data-index', '1');

  // Hold the left stick to the left: continuous scrub toward later chapters.
  const thumbX = async (): Promise<number> => ((await page.locator('.tl-thumb').boundingBox())?.x ?? 0);
  const before = await thumbX();
  await setPad(page, [-1, 0, 0, 0]);
  await expect.poll(async () => Number(await index(page)), { timeout: 10000 }).toBeGreaterThanOrEqual(4);
  expect(await thumbX()).toBeLessThan(before);
  await setPad(page, [0, 0, 0, 0]);
  // After release the thumb snaps onto a chapter and the year matches the map.
  await expect.poll(async () => {
    const i = Number(await index(page));
    const left = await page.locator('.tl-thumb').evaluate((el) => el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2);
    const node = await page.locator('.tl-node').nth(i).evaluate((el) => el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2);
    return Math.abs(left - node) < 1.5;
  }).toBe(true);
  const year = await timeline(page).getAttribute('data-year');
  await expect(map(page)).toHaveAttribute('data-year', year ?? '');
  expect(problems).toEqual([]);
});

test('scrubs by dragging; a drag does not select a chapter', async ({ page }) => {
  await openView(page);
  const box = await page.locator('.tl-track').boundingBox();
  if (!box) throw new Error('no track');
  const y = box.y + 8;
  await page.mouse.move(box.x + box.width - 4, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, y, { steps: 8 });
  await page.mouse.move(box.x + 4, y, { steps: 8 });
  await page.mouse.up();
  await expect(timeline(page)).toHaveAttribute('data-index', '12');
  expect(await page.evaluate(() => (window as unknown as Win).__selected)).toBeUndefined();
  await expect(map(page)).toHaveAttribute('data-era', 'epilogue');
});

test('shows era markers with sources and toggles the two lenses', async ({ page }) => {
  const problems = watchConsole(page);
  await openView(page);
  await expect(page.locator('.lm-place')).toHaveCount(9);
  await expect(map(page)).toHaveAttribute('data-lens', '');
  await page.locator('.tl-node[data-chapter="ch02"]').click();
  await expect(map(page)).toHaveAttribute('data-era', 'ch02');
  await expect(page.locator('.lm-place')).toHaveCount(18);
  await expect(page.locator('[data-lens-box="independence"] .lm-lens-label')).toContainText('מלחמת העצמאות');
  await expect(page.locator('[data-lens-box="independence"] .lm-sources')).toContainText('C2-004');
  await expect(page.locator('.lm-note[data-marker="lod-ramle"]')).toContainText('מבצע דני');
  // Button toggle.
  await page.locator('[data-action="toggle-lens"]').click();
  await expect(page.locator('[data-lens-box="nakba"] .lm-lens-label')).toContainText('הנכבה');
  await expect(page.locator('[data-lens-box="nakba"] .lm-sources')).toContainText('C2-003');
  await expect(map(page)).toHaveAttribute('data-lens', 'nakba');
  await expect(page.locator('.lm-note[data-marker="deir-yassin"]')).toContainText('טבח');
  // Controller toggle (north face button = alt).
  await tapButton(page, 3);
  await expect(map(page)).toHaveAttribute('data-lens', 'independence');
  // Bumpers also switch the lens while the map is shown with the timeline.
  await tapButton(page, 5);
  await expect(map(page)).toHaveAttribute('data-lens', 'nakba');
  // Line layers are shown as pending, never guessed.
  await expect(page.locator('[data-layer="armistice-lines-1949"]')).toContainText('חסרים נתוני מקור');
  // A chapter without lenses says so.
  await page.locator('.tl-node[data-chapter="ch01"]').click();
  await expect(page.locator('[data-lens-box="none"]')).toBeVisible();
  expect(problems).toEqual([]);
});

test('map: draw calls stay low; right stick orbits, triggers and pinch zoom; unmount disposes', async ({ page }) => {
  const problems = watchConsole(page);
  const geometries = (): Promise<number> => page.evaluate(() => window.__netivim?.renderer.info.memory.geometries ?? -1);
  const baseline = await geometries();
  await page.evaluate(() => window.__netivim?.settings.update('accessibility', { reducedMotion: true }));
  await openView(page);
  await page.locator('.tl-node[data-chapter="ch02"]').click();
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => window.__netivim?.renderer.info.render.calls ?? -1);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThanOrEqual(60);
  await expect(page.locator('.lm-label:not([hidden])').first()).toBeVisible();

  const rig = (): Promise<{ az: number; dist: number }> =>
    page.evaluate(() => {
      const r = (window as unknown as Win).__view?.map.mapScene?.rig;
      return { az: r?.azimuth ?? NaN, dist: r?.distance ?? NaN };
    });
  const start = await rig();
  await setPad(page, [0, 0, 1, 0]);
  await expect.poll(async () => (await rig()).az, { timeout: 10000 }).toBeGreaterThan(start.az + 0.05);
  await setPad(page, [0, 0, 0, 0]);
  const mid = await rig();
  // Right trigger (button 7) zooms out, left trigger (button 6) zooms in.
  await setPad(page, [0, 0, 0, 0], [7]);
  await expect.poll(async () => (await rig()).dist, { timeout: 10000 }).toBeGreaterThan(mid.dist + 1);
  await setPad(page, [0, 0, 0, 0], [6]);
  await expect.poll(async () => (await rig()).dist, { timeout: 10000 }).toBeLessThan(mid.dist);
  await setPad(page, [0, 0, 0, 0]);

  // Pinch: two synthetic pointers moving apart zoom in.
  const before = await rig();
  await page.evaluate(() => {
    const layer = document.querySelector('.lm-gesture');
    if (!layer) throw new Error('no gesture layer');
    const fire = (type: string, id: number, x: number): void => {
      layer.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: 150, bubbles: true, pointerType: 'touch' }));
    };
    fire('pointerdown', 11, 300);
    fire('pointerdown', 12, 340);
    fire('pointermove', 11, 200);
    fire('pointermove', 12, 440);
    fire('pointerup', 11, 200);
    fire('pointerup', 12, 440);
  });
  expect((await rig()).dist).toBeLessThan(before.dist);

  await page.evaluate(() => (window as unknown as Win).__view?.close());
  await expect(page.locator('[data-screen]')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await geometries()).toBe(baseline);
  expect(problems).toEqual([]);
});
