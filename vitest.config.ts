import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './tests/shims/server-only.ts'),
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
    env: {
      DATABASE_URL: 'file:./tests/tmp/test.db',
      SESSION_SECRET: 'test-only-session-secret',
      APP_PASSWORD: 'test-only-app-password',
      USE_MOCK_DATA: 'false',
      FX_USD_JPY: '150',
    },
  },
});
