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

test("pages workflow publishes the built web app", () => {
  const wf = parse(readFileSync(".github/workflows/pages.yml", "utf8"));
  const steps = wf.jobs.deploy.steps;
  expect(steps.find((s: { uses?: string }) => s.uses?.startsWith("actions/upload-pages-artifact")).with.path).toBe("app-dist");
  expect(wf.permissions).toMatchObject({ pages: "write", "id-token": "write" });
});
