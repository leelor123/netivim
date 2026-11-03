import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.leelor123.netivim',
  appName: 'נתיבים',
  webDir: 'dist',
  backgroundColor: '#0e1116',
  android: {
    // All assets ship inside the APK; no remote content is ever loaded.
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
