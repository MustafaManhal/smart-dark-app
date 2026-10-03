// Serves app-dist with the same response headers Vercel adds (from vercel.json),
// so the browser tests run against production headers, CSP included.
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../app-dist/", import.meta.url)); // decoded: the folder name may contain spaces
const port = Number(process.argv[2] ?? 5198);
const rules = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url))).headers.map((r) => ({
  re: new RegExp(`^${r.source.replace(/\(\.\*\)/g, ".*")}$`),
  headers: r.headers,
}));
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".bcmap": "application/octet-stream", ".pfb": "application/octet-stream",
  ".ttf": "font/ttf", ".icc": "application/octet-stream",
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  let file = normalize(join(root, path === "/" ? "/index.html" : path));
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    if (!statSync(file).isFile()) throw new Error();
  } catch {
    return res.writeHead(404).end("Not found");
  }
  for (const rule of rules) if (rule.re.test(path)) for (const h of rule.headers) res.setHeader(h.key, h.value);
  res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving app-dist on http://localhost:${port}`));
