import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

/**
 * Routes the Android Back button to the game instead of letting it close the app.
 * The handler decides what Back means (open/close the pause menu).
 */
export async function bindAndroidBackButton(onBack: () => void): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  await App.addListener('backButton', () => onBack());
}
