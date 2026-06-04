const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'],
  timeout: 10000,
  reporter: [['list']],
  webServer: {
    command: 'python3 -m http.server 3456',
    port: 3456,
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: 'http://localhost:3456'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
