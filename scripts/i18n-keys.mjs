// Lists every literal string passed to t() in app/src, plus known dynamic keys.
// Used by the i18n test to make sure each one has an Arabic translation.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|ts)$/.test(n) ? [p] : [];
  });
}

export function literalKeys(root = "app/src") {
  const keys = new Set();
  const re = /(?<![\w.$])t\(\s*"((?:[^"\\]|\\.)*)"/g;
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(re)) keys.add(m[1].replace(/\\"/g, '"'));
  }
  return [...keys].sort();
}

if (process.argv[1]?.endsWith("i18n-keys.mjs")) console.log(literalKeys().join("\n"));
