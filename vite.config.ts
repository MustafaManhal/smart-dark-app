import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: "../app-dist", emptyOutDir: true, target: "es2022" },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
