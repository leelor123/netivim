import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export const isAndroidApp = (): boolean => Capacitor.getPlatform() === 'android';

/**
 * Routes the Android Back button to the game instead of letting it close the app.
 * The handler decides what Back means (open/close the pause menu).
 */
export async function bindAndroidBackButton(onBack: () => void): Promise<void> {
  if (!isAndroidApp()) return;
  await App.addListener('backButton', () => onBack());
}

/** App sent to background (home button, app switch, screen lock): save immediately. */
export async function bindAndroidPause(onPause: (trigger: string) => void): Promise<void> {
  if (!isAndroidApp()) return;
  await App.addListener('pause', () => onPause('capacitor:pause'));
  await App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) onPause('capacitor:appStateChange');
  });
}
