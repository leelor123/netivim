import { expect, test, type Page } from '@playwright/test';

/**
 * Phone UX on the player's device ratio (Galaxy S26 Ultra landscape, 1170x540 CSS px), touch only:
 * the briefing keeps its actions visible, the mission frame has no overlapping HUD boxes, and a
 * one-finger drag on the right half turns the camera.
 */
test.use({ viewport: { width: 1170, height: 540 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

const DRIVER_NOISE = /GL Driver Message \(OpenGL, Performance,/;

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (msg) => {
    if ((msg.type() === 'error' || msg.type() === 'warning') && !DRIVER_NOISE.test(msg.text())) problems.push(msg.type() + ': ' + msg.text());
  });
  page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
  return problems;
}

const cameraYaw = (page: Page): Promise<number> => page.evaluate(() => window.__netivimGameplay?.host?.level?.player?.cameraYaw ?? Number.NaN);

/** Every visible HUD box in the mission frame (all overlays, all regions). */
const HUD_BOXES = ['.nv-hud__bar', '.gp-hud__panel', '.gp-hud__meter', '.gp-hud__hint', '.gp-hud__prompt', '.an-banner', '.nv-sub__box', '.nv-toast__text', '.touch-btn', '.touch-ring'];

interface Box {
  sel: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const visibleBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate((sels) => {
    const out: { sel: string; x: number; y: number; w: number; h: number }[] = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll<HTMLElement>(sel)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || el.closest('[hidden]')) continue;
        out.push({ sel, x: r.x, y: r.y, w: r.width, h: r.height });
      }
    }
    return out;
  }, HUD_BOXES);

async function startPrologue(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('title');
  await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
  await page.evaluate(() => window.__netivim?.flow.send('openHub'));
  await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
  await page.evaluate(() => window.__netivimGameplay?.beginChapter('prologue', false));
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('briefing');
}

test('phone: briefing actions stay on screen, mission HUD boxes never overlap, drag turns the camera', async ({ page }) => {
  test.setTimeout(240000);
  const problems = watchConsole(page);
  await startPrologue(page);

  // Briefing: the Start button is in the sticky footer, fully inside the 540 px viewport.
  const start = page.getByRole('button', { name: 'התחלת המשימה' });
  await expect(start).toBeVisible();
  const sb = await start.boundingBox();
  if (!sb) throw new Error('no start box');
  expect(sb.y + sb.height).toBeLessThanOrEqual(540);
  await start.tap();
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('mission');
  await expect(page.locator('.touch-root')).toBeVisible();

  // Only interact and alt during play; one pause control (the HUD icon).
  await expect(page.locator('.touch-btn')).toHaveCount(2);
  await expect(page.locator('.touch-btn[data-action="map"], .touch-btn[data-action="pause"]')).toHaveCount(0);
  await expect(page.locator('.nv-hudbtn--icon')).toHaveCount(1);

  // Wait for the opening guide line, so the caption, tutorial line and objective are all up.
  await expect(page.locator('.nv-sub')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.an-banner')).toBeVisible();
  // Pin a labeled guide line (no timeout) so the busiest frame is stable on slow software GL:
  // one caption box with speaker + label chip, never a second box.
  await page.evaluate(() =>
    window.__netivim?.bus.emit('subtitle:show', { textKey: 'ch00.hub.guides.note', speakerKey: 'ch00.speaker.noa', durationMs: 0, voice: false, label: 'composite' }),
  );
  await expect(page.locator('.nv-sub__label')).toBeVisible();
  await expect(page.locator('.nv-sub__box')).toHaveCount(1);
  // A toast too (manual save), to fill the busiest frame.
  await page.evaluate(() => window.__netivim?.bus.emit('ui:toast', { textKey: 'ui.toast.saved' }));

  const boxes = await visibleBoxes(page);
  for (const want of ['.nv-hud__bar', '.gp-hud__panel', '.an-banner', '.nv-sub__box', '.touch-btn']) expect(boxes.some((b) => b.sel === want), want).toBe(true);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i] as Box;
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.x + a.w).toBeLessThanOrEqual(1170.5);
    expect(a.y + a.h).toBeLessThanOrEqual(540.5);
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j] as Box;
      const overlap = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
      expect(overlap, a.sel + ' overlaps ' + b.sel).toBe(false);
    }
  }

  // One-finger drag on the right half turns the camera (CDP touch events -> pointerType touch).
  const before = await cameraYaw(page);
  expect(Number.isFinite(before)).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const x0 = 820;
  const y0 = 300;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 7 }] });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - i * 20, y: y0, id: 7 }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  // 200 px of drag at 0.0045 rad/px is 0.9 rad (0.54 with reduced motion); require a clear turn.
  await expect.poll(async () => Math.abs((await cameraYaw(page)) - before), { timeout: 15000 }).toBeGreaterThan(0.3);
  expect(await page.evaluate(() => window.__netivim?.input.device)).toBe('touch');

  expect(problems).toEqual([]);
});

test('phone: extra large UI text keeps the briefing actions on screen and the mission boxes apart', async ({ page }) => {
  test.setTimeout(240000);
  const problems = watchConsole(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('title');
  await page.evaluate(() => window.__netivim?.settings.update('accessibility', { uiTextSize: 'xlarge' }));
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--nv-ts'))).toBe('1.4');
  await startPrologue(page);
  const start = page.getByRole('button', { name: 'התחלת המשימה' });
  await expect(start).toBeVisible();
  const sb = await start.boundingBox();
  if (!sb) throw new Error('no start box');
  expect(sb.y + sb.height).toBeLessThanOrEqual(540);
  await start.tap();
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('mission');
  await page.evaluate(() => window.__netivim?.bus.emit('ui:toast', { textKey: 'ui.toast.saved' }));
  const boxes = await visibleBoxes(page);
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i] as Box;
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j] as Box;
      const overlap = a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
      expect(overlap, a.sel + ' overlaps ' + b.sel).toBe(false);
    }
  }
  expect(problems).toEqual([]);
});

interface ViewerFit {
  readonly cardTop: number;
  readonly cardBottom: number;
  readonly back: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number };
  readonly bodyScrolls: boolean;
}

/** The provenance card and its Back button, measured against the viewport. */
const viewerFit = (page: Page): Promise<ViewerFit> =>
  page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.gp-provenance');
    const back = document.querySelector<HTMLElement>('[data-key="viewer-back"]');
    const body = document.querySelector<HTMLElement>('.gp-provenance__body');
    if (!card || !back || !body) throw new Error('viewer card not found');
    const c = card.getBoundingClientRect();
    const b = back.getBoundingClientRect();
    return { cardTop: c.top, cardBottom: c.bottom, back: { top: b.top, bottom: b.bottom, left: b.left, right: b.right }, bodyScrolls: body.scrollHeight > body.clientHeight + 1 };
  });

// CQA-2: the archive viewer card used to grow past a 540 px tall screen and hide its Back button.
for (const size of ['normal', 'xlarge'] as const) {
  test('phone: archive viewer card fits and keeps Back on screen (UI text ' + size + ')', async ({ page }) => {
    test.setTimeout(180000);
    const problems = watchConsole(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state), { timeout: 60000 }).toBe('title');
    await expect.poll(() => page.evaluate(() => !!window.__netivimGameplay), { timeout: 45000 }).toBe(true);
    await page.evaluate((s) => window.__netivim?.settings.update('accessibility', { uiTextSize: s }), size);
    await page.evaluate(() => {
      const g = window.__netivim;
      if (!g) return;
      const st = g.getState();
      g.setState({ ...st, unlocks: { ...st.unlocks, archive: ['basel-program'] } });
      g.flow.send('openHub');
    });
    await expect(page.locator('[data-screen="gp-hub"]')).toBeVisible({ timeout: 60000 });
    await page.locator('[data-screen="gp-hub"] [data-key="archive"]').tap();
    await expect(page.locator('[data-screen="gp-archive"]')).toBeVisible({ timeout: 30000 });
    await page.locator('[data-key="archive-basel-program"]').tap();
    await expect(page.locator('.gp-provenance')).toBeVisible({ timeout: 30000 });
    const fit = await viewerFit(page);
    expect(fit.cardTop).toBeGreaterThanOrEqual(0);
    expect(fit.cardBottom).toBeLessThanOrEqual(540);
    expect(fit.back.top).toBeGreaterThanOrEqual(fit.cardTop);
    expect(fit.back.bottom).toBeLessThanOrEqual(fit.cardBottom);
    expect(fit.back.left).toBeGreaterThanOrEqual(0);
    expect(fit.back.right).toBeLessThanOrEqual(1170);
    // Long text scrolls inside the card; Back stays put.
    if (fit.bodyScrolls) {
      await page.evaluate(() => {
        const body = document.querySelector<HTMLElement>('.gp-provenance__body');
        if (body) body.scrollTop = body.scrollHeight;
      });
      expect((await viewerFit(page)).back.top).toBeCloseTo(fit.back.top, 0);
    }
    await page.locator('[data-key="viewer-back"]').tap();
    await expect(page.locator('[data-screen="gp-archive"]')).toBeVisible({ timeout: 30000 });
    expect(problems).toEqual([]);
  });
}
