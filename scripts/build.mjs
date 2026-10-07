// Assembles the unpacked extension in dist/ and, with --zip, the upload
// package for the Chrome Web Store.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const pdfjs = new URL("node_modules/pdfjs-dist/", root);
const target = new URL("lib/pdfjs/", dist);

rmSync(dist, { recursive: true, force: true });
cpSync(new URL("src/", root), dist, { recursive: true });
mkdirSync(target, { recursive: true });

// Legacy build: supports Chrome 125+ (our minimum is 128). Not minified, so
// store reviewers can read it.
for (const file of ["pdf.mjs", "pdf.worker.mjs"]) {
  cpSync(new URL(`legacy/build/${file}`, pdfjs), new URL(file, target));
}
for (const dir of ["cmaps", "standard_fonts", "iccs"]) {
  cpSync(new URL(`${dir}/`, pdfjs), new URL(`${dir}/`, target), { recursive: true });
}
// Image decoders and color management only. The QuickJS files are for PDF
// form scripting, which this viewer does not enable.
cpSync(new URL("wasm/", pdfjs), new URL("wasm/", target), {
  recursive: true,
  filter: (src) => !/quickjs/i.test(src),
});
cpSync(new URL("LICENSE", pdfjs), new URL("LICENSE", target));
// The Inter typeface (SIL OFL 1.1), with its license, for the viewer, the popup and the welcome page.
const inter = new URL("node_modules/@fontsource-variable/inter/", root);
mkdirSync(new URL("lib/fonts/", dist), { recursive: true });
cpSync(new URL("files/inter-latin-wght-normal.woff2", inter), new URL("lib/fonts/inter-latin-wght-normal.woff2", dist));
cpSync(new URL("LICENSE", inter), new URL("lib/fonts/Inter-OFL.txt", dist));

const manifest = JSON.parse(readFileSync(new URL("manifest.json", dist), "utf8"));
console.log(`built dist/ (version ${manifest.version})`);

// Test-only build: automated browsers cannot click Chrome's permission
// prompt, so host access is granted at install. Never upload this one.
if (process.argv.includes("--e2e")) {
  const e2e = new URL("dist-e2e/", root);
  rmSync(e2e, { recursive: true, force: true });
  cpSync(dist, e2e, { recursive: true });
  const testManifest = { ...manifest, host_permissions: manifest.optional_host_permissions };
  delete testManifest.optional_host_permissions;
  writeFileSync(new URL("manifest.json", e2e), JSON.stringify(testManifest, null, 2));
  console.log("built dist-e2e/ (test only)");
}

if (process.argv.includes("--zip")) {
  const zipName = `reader343-extension-${manifest.version}.zip`;
  const zipPath = new URL(zipName, root);
  if (existsSync(zipPath)) rmSync(zipPath);
  execFileSync("zip", ["-qr", "-X", `../${zipName}`, ".", "-x", ".*", "-x", "*/.*"], { cwd: dist, stdio: "inherit" });
  console.log(`packaged ${zipName}`);
}
