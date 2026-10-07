import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/app-e2e",
  outputDir: "test/output/app-e2e",
  fullyParallel: true,
  // Tests always run against a fresh production build on their own port,
  // never against a dev server someone has open on 5199.
  use: { baseURL: "http://localhost:5198/" },
  webServer: {
    // Production build behind the same headers Vercel sends (vercel.json), CSP included.
    command: "npm run app:build && node scripts/serve-app.mjs 5198",
    url: "http://localhost:5198/",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
    // Firefox runs on GitHub only (.github/workflows/web-firefox.yml): FIREFOX=1 adds the project.
    ...(process.env.FIREFOX ? [{ name: "firefox-desktop", use: { ...devices["Desktop Firefox"], viewport: { width: 1280, height: 800 } } }] : []),
  ],
});
