import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4300',
    ...devices['Pixel 7'],
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx ng serve --port 4300 --host 127.0.0.1',
    url: 'http://127.0.0.1:4300',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
