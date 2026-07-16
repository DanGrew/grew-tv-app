const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'],
  timeout: 10000,
  reporter: [['list']],
  webServer: {
    command: 'python3 -m http.server 3456',
    port: 3456,
    reuseExistingServer: !process.env.CI,
    // `python3 -m http.server` logs EVERY request to stderr, which Playwright pipes
    // into the run output. Over a flake hunt (whole suite x3) that is ~9MB of noise
    // that buries the report, so scripts/flake-hunt.js sets this to hush it. Normal
    // runs keep the log — it is occasionally useful for a 404 — and a server that
    // fails to start still surfaces via the port timeout either way.
    stderr: process.env.GREW_HUSH_WEBSERVER ? 'ignore' : 'pipe'
  },
  use: {
    baseURL: 'http://localhost:3456'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
