import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/app-e2e",
  outputDir: "test/output/app-e2e",
  fullyParallel: true,
  use: { baseURL: "http://localhost:5199/" },
  webServer: { command: "npm run app:build && npx vite preview", url: "http://localhost:5199/", reuseExistingServer: true },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  ],
});
