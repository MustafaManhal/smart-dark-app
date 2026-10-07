// Copies the pdf.js worker and data files the app loads at runtime into
// app/public/pdfjs/. QuickJS (form scripting) is left out on purpose.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const from = new URL("../node_modules/pdfjs-dist/", import.meta.url);
const to = new URL("../app/public/pdfjs/", import.meta.url);
rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(new URL("legacy/build/pdf.worker.mjs", from), new URL("pdf.worker.mjs", to));
for (const dir of ["cmaps", "standard_fonts", "iccs"]) {
  cpSync(new URL(`${dir}/`, from), new URL(`${dir}/`, to), { recursive: true });
}
cpSync(new URL("wasm/", from), new URL("wasm/", to), { recursive: true, filter: (p) => !/quickjs/i.test(p) });
cpSync(new URL("LICENSE", from), new URL("LICENSE", to));
// The license of the Inter typeface travels with the font files the build puts next to the app (SIL OFL 1.1).
mkdirSync(new URL("../app/public/licenses/", import.meta.url), { recursive: true });
cpSync(new URL("../node_modules/@fontsource-variable/inter/LICENSE", import.meta.url), new URL("../app/public/licenses/Inter-OFL.txt", import.meta.url));
// The sample book that the welcome screen offers.
cpSync(new URL("../src/sample/sample.pdf", import.meta.url), new URL("../app/public/sample.pdf", import.meta.url));
console.log("pdf.js assets copied to app/public/pdfjs/");
