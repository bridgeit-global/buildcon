import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    tsconfigPaths: true
  },
  test: {
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', '.next', 'e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'app/crm/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', 'e2e/**']
    }
  }
});
