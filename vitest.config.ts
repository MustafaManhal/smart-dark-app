import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify("test") },
  test: {
    include: ["test/app/**/*.test.ts", "test/app/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["fake-indexeddb/auto"],
  },
});
