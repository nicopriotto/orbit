import { defineConfig, devices } from '@playwright/test';

// E2E_PORT runs the walk on its own server when 5192 is taken by another copy of the studio.
const port = Number(process.env.E2E_PORT ?? 5192);
const url = `http://localhost:${port}`;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: url, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: `npx vite --port ${port} --strictPort`, url, reuseExistingServer: !process.env.CI, env: { META_MOCK: '1' } },
});
