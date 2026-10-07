// Copies what text recognition (OCR) loads at run time into app/public/ocr/: the worker, the
// recognition engine (three builds, the browser picks the one it can run) and the language data.
// All of it is served by the app itself; nothing is fetched from another server.
// Licenses: tesseract.js and tesseract.js-core are Apache-2.0, the language data packages are MIT.
import { cpSync, mkdirSync, rmSync } from "node:fs";

const modules = new URL("../node_modules/", import.meta.url);
const to = new URL("../app/public/ocr/", import.meta.url);
rmSync(to, { recursive: true, force: true });
mkdirSync(new URL("core/", to), { recursive: true });
mkdirSync(new URL("lang/", to), { recursive: true });
cpSync(new URL("tesseract.js/dist/worker.min.js", modules), new URL("worker.min.js", to));
cpSync(new URL("tesseract.js/LICENSE.md", modules), new URL("LICENSE.md", to));
for (const build of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
  cpSync(new URL(`tesseract.js-core/tesseract-core-${build}.wasm.js`, modules), new URL(`core/tesseract-core-${build}.wasm.js`, to));
}
for (const lang of ["eng", "ara"]) {
  cpSync(new URL(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`, modules), new URL(`lang/${lang}.traineddata.gz`, to));
}
console.log("OCR assets copied to app/public/ocr/");
