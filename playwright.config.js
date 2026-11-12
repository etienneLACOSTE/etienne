// @ts-check
const { defineConfig, devices } = require('@playwright/test');

const PORT = 3100; // Dedicated port so tests never hit a running dev server

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 }, hasTouch: true },
      testIgnore: /server-robustness|server-authority|static-files|security-headers/, // Server-only checks, no layout involved
    },
  ],
  webServer: {
    command: 'node server/index.js',
    url: `http://127.0.0.1:${PORT}`,
    // The tests open many connections from one machine: no per-address limits for them.
    // A dropped connection keeps its seat 3 s instead of 30 s (server/socket-utils.js).
    env: { PORT: String(PORT), PER_IP_LIMITS: 'off', SEAT_HOLD_MS: '3000' },
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
