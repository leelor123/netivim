import { expect, test } from '@playwright/test';
import type { GraphicsPreset } from '../../src/core/settings';
import { showPreset } from './helpers';

const PRESETS: readonly GraphicsPreset[] = ['battery', 'low', 'medium', 'high', 'ultra'];

for (const preset of PRESETS) {
  test(`title scene, ${preset}`, async ({ page }) => {
    await showPreset(page, preset);
    await expect(page).toHaveScreenshot(`title-${preset}.png`, { maxDiffPixelRatio: 0.02, animations: 'disabled' });
  });
}
