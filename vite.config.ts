import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [preact()],
  build: { outDir: "../app-dist", emptyOutDir: true, target: "es2022" },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
