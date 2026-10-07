import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [
    preact(),
    VitePWA({
      // Registered by hand in main.tsx: only on the web, not inside the desktop app.
      injectRegister: false,
      registerType: "autoUpdate",
      manifest: {
        name: "Reader343",
        short_name: "Reader343",
        description: "PDF reader with a dark mode that keeps colors and photos.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#111215",
        theme_color: "#111215",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Everything the reader needs offline, including the pdf.js worker,
        // character maps (.bcmap), standard fonts and image decoders (.wasm).
        globPatterns: ["**/*.{js,mjs,css,html,png,svg,wasm,bcmap,pfb,ttf,icc,webmanifest}"],
        // Character maps (~170 small files) are only needed by some CJK PDFs. Precaching
        // them made the first install take ~40 s on a phone, so they are cached on first use.
        // The natural read-aloud voices (tts/, about 58 MB) are optional and for computers
        // only, so they are also cached on first use.
        // The speech model (voices/, 102 MB) is downloaded only when the reader asks for natural voices.
        globIgnores: ["pdfjs/cmaps/**", "tts/**", "voices/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("/pdfjs/cmaps/"),
            handler: "CacheFirst",
            options: { cacheName: "pdfjs-cmaps", expiration: { maxEntries: 250 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes("/tts/"),
            handler: "CacheFirst",
            options: { cacheName: "tts-assets", expiration: { maxEntries: 80 } },
          },
        ],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        // Take control right away, so the first visit is already available offline.
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: "../app-dist", emptyOutDir: true, target: "es2022" },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
