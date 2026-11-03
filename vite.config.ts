import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the same build works inside the Android WebView (and later on Pages).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.0.0'),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
