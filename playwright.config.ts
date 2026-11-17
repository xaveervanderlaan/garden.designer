import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets several checkouts (git worktrees) run their e2e tests side by side.
const PORT = Number(process.env.E2E_PORT) || 4173
const BASE_URL = `http://localhost:${PORT}/garden.designer/`
const PHONE_SPEC = '**/phone.spec.ts'
const isCI = !!process.env.CI

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: PHONE_SPEC },
    // A phone (touch, small screen): only the viewer tests.
    {
      name: 'phone',
      testMatch: PHONE_SPEC,
      use: (({ defaultBrowserType: _browser, ...phone }) => phone)(devices['Pixel 7']),
    },
    // Opt-in: needs the Firefox/WebKit system libraries (gtk, gstreamer, ...).
    ...(process.env.E2E_ALL_BROWSERS === '1'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] }, testIgnore: PHONE_SPEC },
          { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: PHONE_SPEC },
        ]
      : []),
  ],
  // Tests run against the production build, served the same way as on GitHub Pages.
  webServer: {
    command: `${process.env.E2E_SKIP_BUILD ? '' : 'npm run build && '}npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
})
