import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{backend,frontend,scripts}/test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'backend/src/**',
        'frontend/src/{lib,utils}/**',
        'frontend/src/components/watch/gestures.ts',
        'scripts/lib/**',
      ],
      reporter: ['text', 'html'],
      // Per-area floors: CI fails if coverage drops below what the suite reaches today.
      thresholds: {
        'backend/src/{routes,services,middleware}/**': { lines: 95, branches: 80 },
        'backend/src/*.ts': { lines: 75 },
        'frontend/src/{lib,utils}/**': { lines: 90 },
        'scripts/lib/**': { lines: 95 },
      },
    },
  },
})
