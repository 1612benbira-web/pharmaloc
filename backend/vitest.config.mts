import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts', 'tests/dbSetup.ts'],
    fileParallelism: false, // une seule base de test partagée
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
