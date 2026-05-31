const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'],
  webServer: {
    command: 'npx serve . -p 3456',
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
