import { defineConfig } from '@playwright/test'

// Locally this uses the installed Microsoft Edge; in CI, Playwright's bundled Chromium.
const channel = process.env.CI ? undefined : 'msedge'
// The app's base path, as in vite.config.ts. CI sets BASE_PATH to the GitHub Pages path (/focus/),
// so the tests cover the build that gets deployed.
const app = `http://localhost:4173${process.env.BASE_PATH ?? '/'}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: app,
    channel,
    locale: 'en-GB',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: app,
    // Never reuse a running server: it may serve an older build or another base path.
    reuseExistingServer: false,
    timeout: 180_000,
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
})
