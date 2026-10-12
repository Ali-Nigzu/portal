import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 20000,
  use: { baseURL: 'http://127.0.0.1:4101', headless: true, trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {} },
  webServer: [
    { command: 'npm run preview -- --host 127.0.0.1 --port 4101 --strictPort', url: 'http://127.0.0.1:4101', reuseExistingServer: false },
    { command: 'npm exec vite -- --host 127.0.0.1 --port 4100 --strictPort', url: 'http://127.0.0.1:4100', reuseExistingServer: false },
  ],
});
