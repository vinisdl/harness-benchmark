import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'lib/**/*.ts',
        'components/**/*.tsx',
        'app/**/*.tsx',
        'app/api/**/*.ts',
      ],
      exclude: ['lib/db/schema.ts'],
      thresholds: { statements: 85, branches: 75, functions: 85, lines: 85 },
    },
  },
});
