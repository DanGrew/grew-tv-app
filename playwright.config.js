import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testMatch: 'tests/**/*.test.js',
  testIgnore: 'tests/unit/**',
  use: {
    baseURL: 'http://localhost:8080'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
