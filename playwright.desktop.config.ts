import { defineConfig } from "@playwright/test";

// Launches the real Electron app (no browser projects, no web server).
export default defineConfig({
  testDir: "test/desktop-e2e",
  outputDir: "test/output/desktop-e2e",
  workers: 1,
  timeout: 60_000,
  // Only for the natural-voice test: it reads the speech model from this local server.
  webServer: { command: "node scripts/serve-app.mjs 5198", url: "http://localhost:5198/", reuseExistingServer: true },
});
