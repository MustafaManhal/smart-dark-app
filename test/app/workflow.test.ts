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
  expect(wf.jobs.release.needs).toEqual(["version", "build"]);
});

test("desktop workflow releases by itself, with file names the download page can count on", () => {
  const wf = parse(readFileSync(".github/workflows/desktop.yml", "utf8"));
  // A push to main that touches the app starts it; the public pages do not.
  expect(wf.on.push.branches).toEqual(["main"]);
  expect(wf.on.push.paths).toContain("app/**");
  expect(wf.on.push.paths).toContain("!app/public/about/**");
  expect(wf.concurrency).toEqual({ group: "desktop-release", "cancel-in-progress": true });
  // The version of the build is set before anything is built.
  const runs = wf.jobs.build.steps.map((s: { run?: string }) => s.run ?? "");
  expect(runs.findIndex((r: string) => r.startsWith("npm version"))).toBeLessThan(runs.indexOf("npm run app:build"));
  expect(wf.jobs.release.steps.map((s: { run?: string }) => s.run ?? "").join("\n")).toContain("--latest");
  // The download page links to releases/latest/download/<name>: the names carry no version.
  const cfg = parse(readFileSync("electron-builder.yml", "utf8"));
  expect(cfg.artifactName).toBe("Reader343-${os}-${arch}.${ext}");
  const page = readFileSync("app/public/about/download.html", "utf8");
  for (const file of ["Reader343-win-x64.exe", "Reader343-win-arm64.exe", "Reader343-mac-arm64.dmg", "Reader343-mac-x64.dmg", "Reader343-linux-x86_64.AppImage"]) {
    expect(page).toContain(`releases/latest/download/${file}`);
  }
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
