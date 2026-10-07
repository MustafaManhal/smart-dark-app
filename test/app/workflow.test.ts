// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { parse } from "yaml";

test("desktop workflow builds every platform on its own runner", () => {
  const wf = parse(readFileSync(".github/workflows/desktop.yml", "utf8"));
  expect(wf.jobs.build.strategy.matrix.os).toEqual(["macos-latest", "windows-latest", "ubuntu-latest"]);
  const steps = wf.jobs.build.steps.map((s: { run?: string }) => s.run).filter(Boolean);
  expect(steps).toContain("npm ci");
  expect(steps).toContain("npx electron-builder --publish never");
  expect(wf.jobs.release.needs).toBe("build");
});

test("electron-builder config: ad-hoc mac signing, PDF association, installers", () => {
  const cfg = parse(readFileSync("electron-builder.yml", "utf8"));
  expect(cfg.mac.identity).toBe("-");
  expect(cfg.mac.hardenedRuntime).toBe(false);
  expect(cfg.fileAssociations[0].ext).toBe("pdf");
  expect(cfg.win.target.map((t: { target: string }) => t.target)).toContain("nsis");
  expect(cfg.directories.output).toBe("release"); // never the extension's dist/
});

test("vercel.json builds the web app, keeps the service worker fresh and sends a CSP", () => {
  const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  expect(v).toMatchObject({ buildCommand: "npm run app:build", outputDirectory: "app-dist" });
  const sw = v.headers.find((h: { source: string }) => h.source === "/sw.js");
  expect(sw.headers[0].value).toContain("max-age=0");
  const all = v.headers.find((h: { source: string }) => h.source === "/(.*)");
  const csp = all.headers.find((h: { key: string }) => h.key === "Content-Security-Policy").value;
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).toContain("frame-ancestors 'self'"); // the app frames the sections of an e-book itself; other sites cannot frame the app
});
