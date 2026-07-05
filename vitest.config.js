import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    pool: 'vmThreads',
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      provider: 'v8',
      // include (not `all`) forces every core/ file into the map — even ones no
      // test imports — so an untested module reports 0% and trips the per-file
      // floor below. This is what replaces the old check-untested string-match
      // (TASK-307): "the line ran" is now enforced, not "the name appears".
      include: ['core/**/*.js'],
      reporter: ['text', 'json-summary'],
      // Per-file floor over core/**. A NEW untested core file = 0% < floor =>
      // fail, so the coverage gate subsumes check-untested. Advisory per
      // TASK-306: land even if red (app-api.js is the known outlier) and raise a
      // follow-up to lift it, rather than gold-plating to green first. Opt-out by
      // glob — never an enumerated per-file allowlist.
      thresholds: {
        perFile: true,
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  }
});
