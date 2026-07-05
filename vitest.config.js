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
      // Per-file 100% floor over core/**. A NEW untested core file = 0% < 100 =>
      // fail, so the coverage gate subsumes check-untested. 100% is the honest
      // target and the base TASK-305's mutation gate sits on (a mutant can only
      // be killed on a line a test executed). Advisory per TASK-306: lands red on
      // every file with an uncovered branch/line today — land it red and lift
      // those files via a follow-up rather than lowering the bar to go green.
      // Opt-out by glob — never an enumerated per-file allowlist.
      thresholds: {
        perFile: true,
        100: true,
      },
    },
  }
});
