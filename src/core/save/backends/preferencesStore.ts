import { Preferences } from '@capacitor/preferences';
import type { AsyncStore } from '../stores';

/**
 * Android SharedPreferences via Capacitor. Survives clearing WebView storage, so it is the
 * safety net for saves on the phone (BRIEF 8.A).
 */
export function preferencesStore(): AsyncStore {
  return {
    name: 'preferences',
    async get(key) {
      return (await Preferences.get({ key })).value;
    },
    async set(key, value) {
      await Preferences.set({ key, value });
    },
    async remove(key) {
      await Preferences.remove({ key });
    },
  };
}
