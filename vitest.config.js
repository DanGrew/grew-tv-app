import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8'
    }
  }
});
