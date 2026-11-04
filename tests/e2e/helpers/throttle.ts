import type { Page } from '@playwright/test';

/**
 * E2E_CPU_THROTTLE=<rate> (e.g. 4..6) slows the page's CPU through CDP
 * (Emulation.setCPUThrottlingRate) to emulate the slow 2-vCPU, software-GL CI machine locally.
 * Unset, 0 or 1: no throttle. Call first in a spec's beforeEach.
 */
export const CPU_THROTTLE = Number(process.env.E2E_CPU_THROTTLE ?? 0);

export async function applyCpuThrottle(page: Page): Promise<void> {
  if (!(CPU_THROTTLE > 1)) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
}
