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
console.log("pdf.js assets copied to app/public/pdfjs/");
