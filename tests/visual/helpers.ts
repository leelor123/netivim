import { expect, type Page } from '@playwright/test';
import type { GraphicsPreset } from '../../src/core/settings';

/** Boots, pins the camera, applies a preset and waits until its post chain renders. */
export async function showPreset(page: Page, preset: GraphicsPreset, time = 22): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => window.__netivim?.flow.state)).toBe('title');
  await page.addStyleTag({ content: '#ui { visibility: hidden !important; }' });
  await page.evaluate(
    ({ p, t }) => {
      const gfx = window.__netivimGraphics;
      if (!gfx || !window.__netivim) throw new Error('no test hooks');
      gfx.setAdaptiveEnabled(false);
      gfx.setTitleTime(t);
      window.__netivim.settings.update('graphics', { mode: 'preset', preset: p });
    },
    { p: preset, t: time },
  );
  await expect.poll(() => page.evaluate(() => window.__netivimGraphics?.pipeline.ready)).toBe(true);
  // A few rendered frames so shadow maps, AO denoise and bloom mips are all current.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const pipeline = window.__netivimGraphics?.pipeline;
        if (!pipeline) throw new Error('no pipeline');
        let frames = 0;
        const off = pipeline.addFrameListener(() => {
          if (++frames >= 4) {
            off();
            resolve();
          }
        });
      }),
  );
}
