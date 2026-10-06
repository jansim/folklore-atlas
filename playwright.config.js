import { defineConfig, devices } from '@playwright/test';

// Smoke tests of the built site in dist/ (run `npm run build` first).
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node scripts/build-site.js --serve 4173',
    url: 'http://localhost:4173/data/map.json',
    reuseExistingServer: !process.env.CI,
  },
});
