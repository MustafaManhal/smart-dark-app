import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/app-e2e",
  outputDir: "test/output/app-e2e",
  fullyParallel: true,
  // Tests always run against a fresh production build on their own port,
  // never against a dev server someone has open on 5199.
  use: { baseURL: "http://localhost:5198/" },
  webServer: {
    command: "npm run app:build && npx vite preview --port 5198 --strictPort",
    url: "http://localhost:5198/",
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  ],
});
