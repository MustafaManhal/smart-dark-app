# Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a working reader app in `app/`: import PDFs into a local library, open them in a reader with smart dark / sepia / original page styles, resume where you stopped, see chapter progress, and jump through the table of contents. Runs in Chromium (desktop) and WebKit (iPhone).

**Architecture:** Vite builds a Preact + TypeScript single-page app with a hash router. IndexedDB stores PDFs, covers, progress and settings behind small repository classes. pdf.js (legacy build) renders pages; the existing `src/viewer/smart-invert.js` engine recolors them, extended with a tint mapper for sepia.

**Tech Stack:** Vite 8.3, TypeScript 7.0, Preact 10.29.8 + @preact/signals 2.11, pdfjs-dist 6.3 (legacy build), Vitest 5 + jsdom + fake-indexeddb, Playwright 1.63 (Chromium + WebKit).

## Global Constraints

- Reader343 has no license: do not copy its code, strings, icons or assets.
- MIT license (repo root `LICENSE`).
- pdf.js: import only from `pdfjs-dist/legacy/build/*` (Chrome 125+/Safari support), never the modern build.
- Preact pinned to `10.29.8` (11.0.0 is 3 days old).
- All user data stays on the device (IndexedDB). No network calls in this plan.
- Every feature ships with tests: unit tests in `test/app/`, browser tests in `test/app-e2e/` run on both `chromium-desktop` and `webkit-iphone` Playwright projects.
- The Chrome extension (`src/`, `npm test`, `npm run e2e`) must keep passing.
- UI copy: plain, short, sentence case. No exclamation marks.

---

## File map

| File | Responsibility |
|---|---|
| `app/index.html` | HTML entry, viewport, theme-color |
| `app/src/main.tsx` | boot: open DB, load settings, mount `<App>` |
| `app/src/app.tsx` | hash router: library and reader routes |
| `app/src/app.css` | design tokens (light/dark), base element styles |
| `app/src/ui/*.tsx` | `Button`, `IconButton`, `Sheet`, `Icon` |
| `app/src/db/idb.ts` | promise wrapper over IndexedDB |
| `app/src/db/schema.ts` | DB name, version, store creation |
| `app/src/db/repos.ts` | `BooksRepo`, `ProgressRepo`, `SettingsRepo`, types |
| `app/src/reader/pdf.ts` | pdf.js setup, open document, book info, outline flattening |
| `app/src/reader/chapters.ts` | current chapter and chapter progress math |
| `app/src/reader/renderer.ts` | renders pages to canvas, applies page style, text layer |
| `app/src/reader/ReaderScreen.tsx` | reader UI: bars, scroll view, TOC + appearance sheets |
| `app/src/library/importer.ts` | hash, dedupe, info, cover, save |
| `app/src/library/cover.ts` | first-page thumbnail as JPEG blob |
| `app/src/library/LibraryScreen.tsx` | library UI: grid, search, filters, sort, import, delete |
| `app/src/settings.ts` | typed app settings with signals |
| `src/viewer/smart-invert.js` | add `createTintMapper` (sepia) |
| `scripts/copy-pdfjs-assets.mjs` | copy pdf.js worker/cmaps/fonts/wasm into `app/public/pdfjs/` |
| `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts` | tooling |

---

### Task 1: Tooling scaffold

**Files:**
- Create: `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `app/index.html`, `app/src/main.tsx`, `app/src/app.tsx`, `scripts/copy-pdfjs-assets.mjs`, `test/app/smoke.test.tsx`, `test/app-e2e/smoke.spec.ts`
- Modify: `package.json` (deps, scripts), `.gitignore`

**Interfaces:**
- Produces: `npm run app:dev`, `npm run app:build` (output `app-dist/`), `npm run app:test`, `npm run app:e2e`; `<App/>` component exported from `app/src/app.tsx`.

- [ ] **Step 1: Install dependencies**

```bash
npm i preact@10.29.8 @preact/signals@2.11.3
npm i -D vite@8 @preact/preset-vite@2 typescript@7 vitest@5 jsdom fake-indexeddb @playwright/test@1.63
npx playwright install chromium webkit
```

- [ ] **Step 2: Write config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["app/src", "test/app", "test/app-e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: "app",
  base: "./",
  plugins: [preact()],
  build: { outDir: "../app-dist", emptyOutDir: true, target: "es2022" },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  test: {
    include: ["test/app/**/*.test.ts", "test/app/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["fake-indexeddb/auto"],
  },
});
```

`playwright.config.ts`:
```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/app-e2e",
  outputDir: "test/output/app-e2e",
  fullyParallel: true,
  use: { baseURL: "http://localhost:5199/" },
  webServer: { command: "npm run app:build && npx vite preview", url: "http://localhost:5199/", reuseExistingServer: true },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "webkit-iphone", use: { ...devices["iPhone 15"] } },
  ],
});
```

- [ ] **Step 3: Copy pdf.js runtime assets**

`scripts/copy-pdfjs-assets.mjs`:
```js
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
```

Add to `.gitignore`: `app-dist/`, `app/public/pdfjs/`.

Scripts in `package.json`:
```json
"app:assets": "node scripts/copy-pdfjs-assets.mjs",
"app:dev": "npm run app:assets && vite",
"app:build": "npm run app:assets && tsc -p tsconfig.json && vite build",
"app:test": "vitest run",
"app:e2e": "playwright test"
```

- [ ] **Step 4: Minimal app**

`app/index.html`:
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <title>Smart Dark Reader</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="./src/main.tsx"></script>
</body>
</html>
```

`app/src/app.tsx`:
```tsx
export function App() {
  return <main class="app"><h1>Library</h1></main>;
}
```

`app/src/main.tsx`:
```tsx
import { render } from "preact";
import { App } from "./app";

render(<App />, document.getElementById("root")!);
```

- [ ] **Step 5: Smoke tests**

`test/app/smoke.test.tsx`:
```tsx
import { render } from "preact";
import { expect, test } from "vitest";
import { App } from "../../app/src/app";

test("app renders the library heading", () => {
  const root = document.createElement("div");
  render(<App />, root);
  expect(root.querySelector("h1")?.textContent).toBe("Library");
});

test("fake IndexedDB is available", () => {
  expect(typeof indexedDB.open).toBe("function");
});
```

`test/app-e2e/smoke.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("app loads", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Library" })).toBeVisible();
});
```

- [ ] **Step 6: Run everything**

Run: `npm run app:test && npm run app:e2e && npm test`
Expected: 2 vitest passes, 2 Playwright passes (chromium-desktop, webkit-iphone), extension unit tests still 16/16.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "build(app): scaffold Vite + Preact + TS app with Vitest and Playwright"
```

---

### Task 2: Sepia tint mapper in the shared engine

**Files:**
- Modify: `src/viewer/smart-invert.js` (add `TINTS`, `createTintMapper`)
- Test: `test/unit/smart-invert.test.mjs` (append)

**Interfaces:**
- Produces: `createTintMapper(tint: {paper:[r,g,b], ink:[r,g,b]}) => (r,g,b) => packedBGR`, same return format as `createColorMapper`; `TINTS.sepia = { label: "Sepia", paper: [244,236,216], ink: [70,52,36] }`.

- [ ] **Step 1: Write the failing tests** (append to `test/unit/smart-invert.test.mjs`)

```js
import { createTintMapper, TINTS } from "../../src/viewer/smart-invert.js";

test("sepia: paper and ink map to the tint colors", () => {
  const map = createTintMapper(TINTS.sepia);
  assert.deepEqual(unpack(map(255, 255, 255)), TINTS.sepia.paper);
  assert.deepEqual(unpack(map(0, 0, 0)), TINTS.sepia.ink);
});

test("sepia: colors keep their hue and do not invert", () => {
  const map = createTintMapper(TINTS.sepia);
  for (const rgb of [[204, 0, 0], [0, 0, 255], [0, 128, 0]]) {
    const out = unpack(map(...rgb));
    assert.ok(hueDelta(hue(rgb), hue(out)) < 10, `${rgb} -> ${out}`);
    const [Lin] = rgbToOklab(...rgb);
    const [Lout] = rgbToOklab(...out);
    assert.ok(Math.abs(Lin - Lout) < 0.2, "lightness should stay close in a light theme");
  }
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm test`
Expected: FAIL, `createTintMapper` is not exported.

- [ ] **Step 3: Implement** (add after `createColorMapper` in `src/viewer/smart-invert.js`)

```js
export const TINTS = {
  sepia: { label: "Sepia", paper: [244, 236, 216], ink: [70, 52, 36] },
};

/**
 * Light page styles (sepia): no inversion. Lightness is squeezed into the
 * ink..paper range and neutrals take the tint, so white paper becomes warm
 * paper and black text becomes brown ink; colors keep hue and chroma.
 */
export function createTintMapper(tint = TINTS.sepia) {
  const paper = rgbToOklab(...tint.paper);
  const ink = rgbToOklab(...tint.ink);
  const cache = new Map();

  function map(r, g, b) {
    const [L, A, B] = rgbToOklab(r, g, b);
    const C = Math.hypot(A, B);
    const outL = ink[0] + (paper[0] - ink[0]) * L;
    const na = ink[1] + (paper[1] - ink[1]) * L;
    const nb = ink[2] + (paper[2] - ink[2]) * L;
    const colorful = smoothstep(0.008, 0.06, C);
    return pack(oklabToRgb(outL, A * colorful + na * (1 - colorful), B * colorful + nb * (1 - colorful)));
  }

  return function mapColor(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let v = cache.get(key);
    if (v === undefined) {
      if (cache.size > 500000) cache.clear();
      v = map(r, g, b);
      cache.set(key, v);
    }
    return v;
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: all pass (18 tests).

- [ ] **Step 5: Commit**

```bash
git add src/viewer/smart-invert.js test/unit/smart-invert.test.mjs
git commit -m "feat(engine): add sepia tint mapper that keeps hue"
```

---

### Task 3: Storage layer

**Files:**
- Create: `app/src/db/idb.ts`, `app/src/db/schema.ts`, `app/src/db/repos.ts`
- Test: `test/app/db.test.ts`

**Interfaces:**
- Produces:
  - `openDb(name?: string): Promise<IDBDatabase>`
  - `type Book = { id: string; hash: string; title: string; author: string; pageCount: number; fileName: string; fileSize: number; addedAt: number; lastOpenedAt: number | null; finishedAt: number | null }`
  - `type Progress = { bookId: string; page: number; offset: number; updatedAt: number }` (`page` 1-based, `offset` 0..1 inside the page)
  - `class BooksRepo { add(book: Book, file: Blob, cover: Blob | null): Promise<void>; get(id): Promise<Book | undefined>; all(): Promise<Book[]>; update(id, patch: Partial<Book>): Promise<Book>; remove(id): Promise<void>; findByHash(hash): Promise<Book | undefined>; file(id): Promise<Blob | undefined>; cover(id): Promise<Blob | undefined> }`
  - `class ProgressRepo { get(bookId): Promise<Progress | undefined>; all(): Promise<Progress[]>; save(bookId, page, offset): Promise<Progress> }`
  - `class SettingsRepo { get<T>(key: string, fallback: T): Promise<T>; set(key: string, value: unknown): Promise<void> }`
  - `type Repos = { books: BooksRepo; progress: ProgressRepo; settings: SettingsRepo }`, `createRepos(db): Repos`

- [ ] **Step 1: Write the failing tests**

`test/app/db.test.ts`:
```ts
import { beforeEach, expect, test } from "vitest";
import { openDb } from "../../app/src/db/idb";
import { createRepos, type Book, type Repos } from "../../app/src/db/repos";

let repos: Repos;
let n = 0;
beforeEach(async () => {
  repos = createRepos(await openDb(`test-${n++}`));
});

const book = (id: string, extra: Partial<Book> = {}): Book => ({
  id, hash: `h-${id}`, title: `Book ${id}`, author: "", pageCount: 10, fileName: `${id}.pdf`,
  fileSize: 3, addedAt: 1, lastOpenedAt: null, finishedAt: null, ...extra,
});

test("adds a book with its file and cover, and reads them back", async () => {
  await repos.books.add(book("a"), new Blob(["pdf"]), new Blob(["jpg"]));
  expect((await repos.books.get("a"))?.title).toBe("Book a");
  expect(await (await repos.books.file("a"))!.text()).toBe("pdf");
  expect(await (await repos.books.cover("a"))!.text()).toBe("jpg");
  expect((await repos.books.findByHash("h-a"))?.id).toBe("a");
});

test("update merges fields; remove deletes book, file, cover and progress", async () => {
  await repos.books.add(book("a"), new Blob(["pdf"]), null);
  await repos.progress.save("a", 3, 0.5);
  expect((await repos.books.update("a", { title: "New" })).title).toBe("New");
  await repos.books.remove("a");
  expect(await repos.books.get("a")).toBeUndefined();
  expect(await repos.books.file("a")).toBeUndefined();
  expect(await repos.progress.get("a")).toBeUndefined();
});

test("progress clamps page and offset", async () => {
  const p = await repos.progress.save("a", 0, 1.7);
  expect(p.page).toBe(1);
  expect(p.offset).toBe(1);
});

test("settings return the fallback until set", async () => {
  expect(await repos.settings.get("pageStyle", "dark")).toBe("dark");
  await repos.settings.set("pageStyle", "sepia");
  expect(await repos.settings.get("pageStyle", "dark")).toBe("sepia");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run app:test -- db`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`app/src/db/schema.ts`:
```ts
export const DB_NAME = "smart-dark-reader";
export const DB_VERSION = 1;

// Each upgrade step runs once, in order, for users coming from older versions.
export function upgrade(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1) {
    const books = db.createObjectStore("books", { keyPath: "id" });
    books.createIndex("hash", "hash", { unique: true });
    db.createObjectStore("files"); // key: bookId, value: Blob
    db.createObjectStore("covers"); // key: bookId, value: Blob
    db.createObjectStore("progress", { keyPath: "bookId" });
    db.createObjectStore("settings"); // key: setting name
  }
}
```

`app/src/db/idb.ts`:
```ts
import { DB_NAME, DB_VERSION, upgrade } from "./schema";

export function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDb(name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Database upgrade blocked by another open tab"));
  });
}

/**
 * Runs `work` in one transaction and resolves when it commits. Inside `work`,
 * await only IndexedDB requests: awaiting anything else lets the transaction
 * auto-commit early.
 */
export function transaction<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
  return work(tx).then(async (result) => {
    await done;
    return result;
  });
}
```

`app/src/db/repos.ts`:
```ts
import { request, transaction } from "./idb";

export type Book = {
  id: string;
  hash: string;
  title: string;
  author: string;
  pageCount: number;
  fileName: string;
  fileSize: number;
  addedAt: number;
  lastOpenedAt: number | null;
  finishedAt: number | null;
};

export type Progress = { bookId: string; page: number; offset: number; updatedAt: number };

export class BooksRepo {
  constructor(private db: IDBDatabase) {}

  add(book: Book, file: Blob, cover: Blob | null) {
    return transaction(this.db, ["books", "files", "covers"], "readwrite", async (tx) => {
      await request(tx.objectStore("books").add(book));
      await request(tx.objectStore("files").put(file, book.id));
      if (cover) await request(tx.objectStore("covers").put(cover, book.id));
    });
  }

  get(id: string) {
    return transaction(this.db, ["books"], "readonly", (tx) =>
      request<Book | undefined>(tx.objectStore("books").get(id)));
  }

  all() {
    return transaction(this.db, ["books"], "readonly", (tx) => request<Book[]>(tx.objectStore("books").getAll()));
  }

  findByHash(hash: string) {
    return transaction(this.db, ["books"], "readonly", (tx) =>
      request<Book | undefined>(tx.objectStore("books").index("hash").get(hash)));
  }

  update(id: string, patch: Partial<Book>) {
    return transaction(this.db, ["books"], "readwrite", async (tx) => {
      const store = tx.objectStore("books");
      const current = await request<Book | undefined>(store.get(id));
      if (!current) throw new Error(`No book ${id}`);
      const next = { ...current, ...patch, id };
      await request(store.put(next));
      return next;
    });
  }

  remove(id: string) {
    return transaction(this.db, ["books", "files", "covers", "progress"], "readwrite", async (tx) => {
      for (const store of ["books", "files", "covers", "progress"]) await request(tx.objectStore(store).delete(id));
    });
  }

  file(id: string) {
    return transaction(this.db, ["files"], "readonly", (tx) => request<Blob | undefined>(tx.objectStore("files").get(id)));
  }

  cover(id: string) {
    return transaction(this.db, ["covers"], "readonly", (tx) => request<Blob | undefined>(tx.objectStore("covers").get(id)));
  }
}

export class ProgressRepo {
  constructor(private db: IDBDatabase) {}

  get(bookId: string) {
    return transaction(this.db, ["progress"], "readonly", (tx) =>
      request<Progress | undefined>(tx.objectStore("progress").get(bookId)));
  }

  all() {
    return transaction(this.db, ["progress"], "readonly", (tx) => request<Progress[]>(tx.objectStore("progress").getAll()));
  }

  save(bookId: string, page: number, offset: number) {
    const progress: Progress = {
      bookId,
      page: Math.max(1, Math.round(page)),
      offset: Math.min(1, Math.max(0, offset)),
      updatedAt: Date.now(),
    };
    return transaction(this.db, ["progress"], "readwrite", async (tx) => {
      await request(tx.objectStore("progress").put(progress));
      return progress;
    });
  }
}

export class SettingsRepo {
  constructor(private db: IDBDatabase) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const value = await transaction(this.db, ["settings"], "readonly", (tx) => request(tx.objectStore("settings").get(key)));
    return value === undefined ? fallback : (value as T);
  }

  set(key: string, value: unknown) {
    return transaction(this.db, ["settings"], "readwrite", async (tx) => {
      await request(tx.objectStore("settings").put(value, key));
    });
  }
}

export type Repos = { books: BooksRepo; progress: ProgressRepo; settings: SettingsRepo };

export function createRepos(db: IDBDatabase): Repos {
  return { books: new BooksRepo(db), progress: new ProgressRepo(db), settings: new SettingsRepo(db) };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run app:test -- db`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/src/db test/app/db.test.ts && git commit -m "feat(app): IndexedDB storage with books, files, covers, progress, settings"
```

---

### Task 4: PDF service, outline and chapter math

**Files:**
- Create: `app/src/reader/pdf.ts`, `app/src/reader/chapters.ts`
- Modify: `scripts/make-sample-pdf.mjs` (add a two-entry outline), regenerate `src/sample/sample.pdf`
- Test: `test/app/pdf.test.ts`, `test/app/chapters.test.ts`

**Interfaces:**
- Produces:
  - `configurePdfjs(base: string): void` (base URL ending in `/` that holds `pdf.worker.mjs`, `cmaps/`, …)
  - `openPdf(data: Uint8Array): Promise<PDFDocumentProxy>`
  - `type OutlineItem = { title: string; page: number; depth: number }`
  - `flattenOutline(doc): Promise<OutlineItem[]>` (depth-first, pages 1-based, entries without a resolvable page dropped)
  - `readBookInfo(doc, fileName: string): Promise<{ title: string; author: string; pageCount: number }>`
  - `currentChapter(outline: OutlineItem[], page: number, pageCount: number): { item: OutlineItem; index: number; startPage: number; endPage: number } | null`
  - `chapterProgress(outline, page, pageCount): number | null` (0..1)

- [ ] **Step 1: Add an outline to the sample PDF**

In `scripts/make-sample-pdf.mjs`, before `objects[catalog - 1] = ...` add the outline objects, and give the catalog `/Outlines`:
```js
const outlines = add(null);
const o1 = add(null);
const o2 = add(null);
objects[outlines - 1] = `<< /Type /Outlines /First ${o1} 0 R /Last ${o2} 0 R /Count 2 >>`;
objects[o1 - 1] = `<< /Title (Quarterly report) /Parent ${outlines} 0 R /Next ${o2} 0 R /Dest [${page1} 0 R /Fit] >>`;
objects[o2 - 1] = `<< /Title (Page two) /Parent ${outlines} 0 R /Prev ${o1} 0 R /Dest [${page2} 0 R /Fit] >>`;
```
and change the catalog line to:
```js
objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R /Outlines ${outlines} 0 R /PageMode /UseOutlines >>`;
```
Run: `node scripts/make-sample-pdf.mjs`

- [ ] **Step 2: Write the failing tests**

`test/app/chapters.test.ts`:
```ts
import { expect, test } from "vitest";
import { chapterProgress, currentChapter } from "../../app/src/reader/chapters";

const outline = [
  { title: "Intro", page: 1, depth: 0 },
  { title: "Part", page: 1, depth: 1 },
  { title: "One", page: 5, depth: 0 },
  { title: "Two", page: 11, depth: 0 },
];

test("finds the top-level chapter that contains the page", () => {
  expect(currentChapter(outline, 7, 20)).toMatchObject({ index: 1, startPage: 5, endPage: 10 });
  expect(currentChapter(outline, 15, 20)).toMatchObject({ index: 2, startPage: 11, endPage: 20 });
});

test("chapter progress runs from 0 at the first page to 1 at the last", () => {
  expect(chapterProgress(outline, 5, 20)).toBeCloseTo(1 / 6);
  expect(chapterProgress(outline, 10, 20)).toBe(1);
});

test("no outline means no chapter", () => {
  expect(currentChapter([], 3, 10)).toBeNull();
  expect(chapterProgress([], 3, 10)).toBeNull();
});
```

`test/app/pdf.test.ts`:
```ts
// @vitest-environment node
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { flattenOutline, openPdf, readBookInfo } from "../../app/src/reader/pdf";

const sample = () => new Uint8Array(readFileSync("src/sample/sample.pdf"));

test("reads title and page count", async () => {
  const doc = await openPdf(sample());
  expect(await readBookInfo(doc, "sample.pdf")).toEqual({ title: "Smart Dark PDF sample", author: "", pageCount: 2 });
});

test("flattens the outline with 1-based pages", async () => {
  const doc = await openPdf(sample());
  expect(await flattenOutline(doc)).toEqual([
    { title: "Quarterly report", page: 1, depth: 0 },
    { title: "Page two", page: 2, depth: 0 },
  ]);
});

test("falls back to the file name when the PDF has no title", async () => {
  const untitled = { numPages: 3, getMetadata: async () => ({ info: { Title: "  " } }) };
  const info = await readBookInfo(untitled as never, "attention-paper.pdf");
  expect(info).toEqual({ title: "attention-paper", author: "", pageCount: 3 });
});
```

- [ ] **Step 3: Run to see it fail**

Run: `npm run app:test -- chapters pdf`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

`app/src/reader/chapters.ts`:
```ts
import type { OutlineItem } from "./pdf";

// Chapters are the top-level outline entries, in page order.
function chapters(outline: OutlineItem[]) {
  return outline.filter((o) => o.depth === 0).sort((a, b) => a.page - b.page);
}

export function currentChapter(outline: OutlineItem[], page: number, pageCount: number) {
  const list = chapters(outline);
  let index = -1;
  for (let i = 0; i < list.length; i++) if (list[i].page <= page) index = i;
  if (index < 0) return null;
  const startPage = list[index].page;
  const next = list.slice(index + 1).find((c) => c.page > startPage);
  const endPage = next ? next.page - 1 : pageCount;
  return { item: list[index], index, startPage, endPage };
}

export function chapterProgress(outline: OutlineItem[], page: number, pageCount: number): number | null {
  const chapter = currentChapter(outline, page, pageCount);
  if (!chapter) return null;
  const length = chapter.endPage - chapter.startPage + 1;
  return Math.min(1, (page - chapter.startPage + 1) / length);
}
```

`app/src/reader/pdf.ts`:
```ts
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type { PDFDocumentProxy };
export type OutlineItem = { title: string; page: number; depth: number };

let assetBase: string | null = null;

export function configurePdfjs(base: string) {
  assetBase = base;
  pdfjs.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.mjs`;
}

export function openPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  const assets = assetBase
    ? {
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`,
        wasmUrl: `${assetBase}wasm/`,
        iccUrl: `${assetBase}iccs/`,
      }
    : {};
  return pdfjs.getDocument({ data, enableXfa: false, ...assets }).promise;
}

export async function readBookInfo(doc: PDFDocumentProxy, fileName: string) {
  const { info } = (await doc.getMetadata().catch(() => ({ info: {} }))) as { info: Record<string, unknown> };
  const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
  const title = clean(info.Title) || fileName.replace(/\.pdf$/i, "");
  return { title, author: clean(info.Author), pageCount: doc.numPages };
}

export async function flattenOutline(doc: PDFDocumentProxy): Promise<OutlineItem[]> {
  const outline = await doc.getOutline();
  const result: OutlineItem[] = [];
  async function walk(items: typeof outline, depth: number) {
    for (const item of items ?? []) {
      const page = await resolvePage(doc, item.dest);
      if (page) result.push({ title: item.title.trim(), page, depth });
      if (item.items?.length) await walk(item.items, depth + 1);
    }
  }
  await walk(outline, 0);
  return result;
}

async function resolvePage(doc: PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    const explicit = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    if (!Array.isArray(explicit)) return null;
    const [ref] = explicit;
    if (typeof ref === "number") return ref + 1;
    if (ref && typeof ref === "object") return (await doc.getPageIndex(ref)) + 1;
  } catch {}
  return null;
}
```

- [ ] **Step 5: Run tests**

Run: `npm run app:test`
Expected: all pass. If pdf.js in Node needs a worker path, set `pdfjs.GlobalWorkerOptions.workerSrc` to `pdfjs-dist/legacy/build/pdf.worker.mjs` in the test file with `configurePdfjs` not called (pdf.js falls back to its in-process "fake worker" in Node).

- [ ] **Step 6: Commit**

```bash
git add app/src/reader scripts/make-sample-pdf.mjs src/sample/sample.pdf test/app
git commit -m "feat(app): pdf.js service with book info, outline and chapter progress"
```

---

### Task 5: Design system and app shell

**Files:**
- Create: `app/src/app.css`, `app/src/ui/Icon.tsx`, `app/src/ui/Button.tsx`, `app/src/ui/Sheet.tsx`, `app/src/settings.ts`, `app/src/router.ts`
- Modify: `app/src/app.tsx`, `app/src/main.tsx`
- Test: `test/app/ui.test.tsx`, `test/app/router.test.ts`

**Interfaces:**
- Consumes: `openDb`, `createRepos`, `SettingsRepo` (Task 3).
- Produces:
  - `route` signal: `{ name: "library" } | { name: "reader"; bookId: string }`; `navigate(to: Route)`; `parseHash(hash: string): Route`
  - `settings` signals: `pageStyle: Signal<"original" | "sepia" | "dark">`, `darkTheme: Signal<keyof THEMES>`, `imageMode: Signal<"smart"|"keep"|"dim"|"invert">`, `appTheme: Signal<"system"|"light"|"dark">`; `loadSettings(repo)`, `saveSetting(key, value)`
  - `<Icon name="…" />` for: `back, plus, search, more, list, sun, moon, palette, chevronLeft, chevronRight, trash, close, book`
  - `<Button variant="primary"|"ghost"|"danger" />`, `<IconButton label="…" icon="…" />`, `<Sheet open title onClose>`

Design direction: calm, paper-like, generous spacing. Light app chrome is warm off-white; dark chrome is near-black blue-gray. One accent (ink blue). System font stack (no network font, works offline everywhere): `-apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`. Load the `impeccable` skill during this task for a polish pass on spacing, contrast and motion.

- [ ] **Step 1: Write the failing tests**

`test/app/router.test.ts`:
```ts
import { expect, test } from "vitest";
import { parseHash } from "../../app/src/router";

test("parses library and reader routes", () => {
  expect(parseHash("")).toEqual({ name: "library" });
  expect(parseHash("#/")).toEqual({ name: "library" });
  expect(parseHash("#/read/abc-123")).toEqual({ name: "reader", bookId: "abc-123" });
  expect(parseHash("#/nonsense")).toEqual({ name: "library" });
});
```

`test/app/ui.test.tsx`:
```tsx
import { render } from "preact";
import { expect, test, vi } from "vitest";
import { IconButton } from "../../app/src/ui/Button";
import { Sheet } from "../../app/src/ui/Sheet";

test("IconButton has an accessible name and fires onClick", () => {
  const root = document.createElement("div");
  const onClick = vi.fn();
  render(<IconButton label="Back" icon="back" onClick={onClick} />, root);
  const button = root.querySelector("button")!;
  expect(button.getAttribute("aria-label")).toBe("Back");
  button.click();
  expect(onClick).toHaveBeenCalledOnce();
});

test("Sheet renders only when open and closes on Escape", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const onClose = vi.fn();
  render(<Sheet open={false} title="Contents" onClose={onClose}>x</Sheet>, root);
  expect(root.querySelector('[role="dialog"]')).toBeNull();
  render(<Sheet open title="Contents" onClose={onClose}>x</Sheet>, root);
  expect(root.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Contents");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(onClose).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run app:test -- router ui`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement router and settings**

`app/src/router.ts`:
```ts
import { signal } from "@preact/signals";

export type Route = { name: "library" } | { name: "reader"; bookId: string };

export function parseHash(hash: string): Route {
  const match = /^#\/read\/([\w-]+)$/.exec(hash);
  return match ? { name: "reader", bookId: match[1] } : { name: "library" };
}

export const route = signal<Route>(parseHash(location.hash));

export function navigate(to: Route) {
  location.hash = to.name === "reader" ? `#/read/${to.bookId}` : "#/";
}

addEventListener("hashchange", () => {
  route.value = parseHash(location.hash);
});
```

`app/src/settings.ts`:
```ts
import { signal, type Signal } from "@preact/signals";
import type { SettingsRepo } from "./db/repos";

export type PageStyle = "original" | "sepia" | "dark";
export type DarkTheme = "dark" | "dim" | "black" | "warm" | "slate";
export type ImageMode = "smart" | "keep" | "dim" | "invert";
export type AppTheme = "system" | "light" | "dark";

const defaults = {
  pageStyle: "dark" as PageStyle,
  darkTheme: "dark" as DarkTheme,
  imageMode: "smart" as ImageMode,
  appTheme: "system" as AppTheme,
};

type Settings = typeof defaults;
export const settings = Object.fromEntries(
  Object.entries(defaults).map(([k, v]) => [k, signal(v)]),
) as { [K in keyof Settings]: Signal<Settings[K]> };

let repo: SettingsRepo | null = null;

export async function loadSettings(settingsRepo: SettingsRepo) {
  repo = settingsRepo;
  for (const key of Object.keys(defaults) as (keyof Settings)[]) {
    (settings[key] as Signal<unknown>).value = await settingsRepo.get(key, defaults[key]);
  }
}

export function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings[key].value = value;
  repo?.set(key, value);
}
```

- [ ] **Step 4: Implement UI primitives and tokens**

`app/src/ui/Icon.tsx` (paths drawn on a 24px grid, stroke 1.75, written for this project):
```tsx
const PATHS: Record<string, string> = {
  back: "M15 18l-6-6 6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  palette: "M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3zM7.5 12h.01M9.5 8h.01M14.5 8h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
```

`app/src/ui/Button.tsx`:
```tsx
import type { ComponentChildren, JSX } from "preact";
import { Icon, type IconName } from "./Icon";

type Base = Omit<JSX.HTMLAttributes<HTMLButtonElement>, "icon">;

export function Button({ variant = "ghost", children, ...rest }: Base & { variant?: "primary" | "ghost" | "danger"; children: ComponentChildren }) {
  return <button type="button" class={`btn btn-${variant}`} {...rest}>{children}</button>;
}

export function IconButton({ label, icon, ...rest }: Base & { label: string; icon: IconName }) {
  return (
    <button type="button" class="icon-btn" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
```

`app/src/ui/Sheet.tsx`:
```tsx
import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { IconButton } from "./Button";

// Bottom sheet on phones, centered panel on wide screens (see .sheet in app.css).
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ComponentChildren }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header class="sheet-head">
          <h2>{title}</h2>
          <IconButton label="Close" icon="close" onClick={onClose} />
        </header>
        <div class="sheet-body">{children}</div>
      </section>
    </div>
  );
}
```

`app/src/app.css`:
```css
:root {
  color-scheme: light;
  --bg: #f5f3ee;
  --surface: #fffefb;
  --surface-2: #ece9e2;
  --text: #1c1b19;
  --muted: #6d6a63;
  --border: #e0dcd3;
  --accent: #3550c9;
  --accent-text: #ffffff;
  --danger: #c2372f;
  --shadow: 0 1px 2px rgb(30 25 15 / 0.06), 0 8px 24px rgb(30 25 15 / 0.08);
  --radius: 14px;
  --radius-sm: 10px;
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --font: -apple-system, "SF Pro Text", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
}

:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #111215;
  --surface: #191a1e;
  --surface-2: #232429;
  --text: #ebebee;
  --muted: #9a9ba3;
  --border: #2b2c32;
  --accent: #91a7ff;
  --accent-text: #0b1026;
  --danger: #ff8a80;
  --shadow: 0 1px 2px rgb(0 0 0 / 0.4), 0 10px 30px rgb(0 0 0 / 0.35);
}

* { box-sizing: border-box; }
[hidden] { display: none !important; }

html, body { margin: 0; height: 100%; }

body {
  font: 15px/1.45 var(--font);
  background: var(--bg);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

button, input, select { font: inherit; color: inherit; }
:is(button, a, input, select):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.btn {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.12s var(--ease), background 0.15s;
}
.btn:active { transform: scale(0.97); }
.btn-primary { background: var(--accent); color: var(--accent-text); border-color: transparent; }
.btn-danger { background: var(--danger); color: #fff; border-color: transparent; }

.icon-btn {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
}
.icon-btn:hover { background: var(--surface-2); }
.icon-btn:disabled { opacity: 0.35; cursor: default; }

.sheet-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  align-items: end;
  background: rgb(0 0 0 / 0.35);
  animation: fade 0.18s var(--ease);
}
.sheet {
  max-height: 85vh;
  overflow: auto;
  padding: 8px 16px calc(16px + var(--safe-bottom));
  background: var(--surface);
  border-radius: 20px 20px 0 0;
  box-shadow: var(--shadow);
  animation: rise 0.24s var(--ease);
}
.sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sheet-head h2 { margin: 0; font-size: 17px; }

@media (min-width: 720px) {
  .sheet-backdrop { place-items: center; }
  .sheet { width: min(520px, 92vw); border-radius: var(--radius); padding-bottom: 16px; }
}

@keyframes fade { from { opacity: 0; } }
@keyframes rise { from { transform: translateY(24px); opacity: 0; } }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 5: Wire the shell**

`app/src/app.tsx`:
```tsx
import { effect } from "@preact/signals";
import { route } from "./router";
import { settings } from "./settings";
import { LibraryScreen } from "./library/LibraryScreen";
import { ReaderScreen } from "./reader/ReaderScreen";
import type { Repos } from "./db/repos";

// Follow the system theme unless the user picked one.
const media = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  const pick = settings.appTheme.value;
  const dark = pick === "dark" || (pick === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
effect(applyTheme);
media.addEventListener("change", applyTheme);

export function App({ repos }: { repos: Repos }) {
  const r = route.value;
  return r.name === "reader"
    ? <ReaderScreen key={r.bookId} repos={repos} bookId={r.bookId} />
    : <LibraryScreen repos={repos} />;
}
```

`app/src/main.tsx`:
```tsx
import { render } from "preact";
import "./app.css";
import { App } from "./app";
import { openDb } from "./db/idb";
import { createRepos } from "./db/repos";
import { configurePdfjs } from "./reader/pdf";
import { loadSettings } from "./settings";

configurePdfjs(new URL("./pdfjs/", document.baseURI).href);
const repos = createRepos(await openDb());
await loadSettings(repos.settings);
navigator.storage?.persist?.().catch(() => {});
render(<App repos={repos} />, document.getElementById("root")!);
```

Update `test/app/smoke.test.tsx` to test `parseHash` only (the `App` test moves to e2e, since `App` now needs repos), and update `test/app-e2e/smoke.spec.ts` to expect the empty library heading `Your library`.

- [ ] **Step 6: Run tests**

Run: `npm run app:test`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/src test/app && git commit -m "feat(app): design tokens, UI primitives, router and settings"
```

---

### Task 6: Import and library screen

**Files:**
- Create: `app/src/library/importer.ts`, `app/src/library/cover.ts`, `app/src/library/LibraryScreen.tsx`, `app/src/library/library.css`, `app/src/library/filters.ts`
- Test: `test/app/importer.test.ts`, `test/app/filters.test.ts`, `test/app-e2e/library.spec.ts`

**Interfaces:**
- Consumes: `BooksRepo`, `ProgressRepo` (Task 3); `openPdf`, `readBookInfo` (Task 4); `navigate` (Task 5).
- Produces:
  - `importPdf(file: File, deps: { books: BooksRepo; makeCover: (doc: PDFDocumentProxy) => Promise<Blob | null>; now?: () => number; newId?: () => string }): Promise<{ book: Book; duplicate: boolean }>`; throws `ImportError` with `code: "not-pdf" | "unreadable"`.
  - `makeCover(doc, width = 360): Promise<Blob | null>`
  - `type Shelf = "all" | "reading" | "unread" | "finished"`, `type SortKey = "recent" | "title" | "progress"`
  - `shelfOf(book: Book, progress?: Progress): Exclude<Shelf, "all">`, `percentRead(book, progress?): number` (0..100)
  - `filterBooks(books: Book[], progress: Map<string, Progress>, opts: { shelf: Shelf; query: string; sort: SortKey }): Book[]`

- [ ] **Step 1: Write the failing tests**

`test/app/filters.test.ts`:
```ts
import { expect, test } from "vitest";
import { filterBooks, percentRead, shelfOf } from "../../app/src/library/filters";
import type { Book, Progress } from "../../app/src/db/repos";

const b = (id: string, title: string, extra: Partial<Book> = {}): Book => ({
  id, hash: id, title, author: "Ann Writer", pageCount: 100, fileName: "", fileSize: 0,
  addedAt: 0, lastOpenedAt: null, finishedAt: null, ...extra,
});
const p = (bookId: string, page: number, updatedAt = 0): Progress => ({ bookId, page, offset: 0, updatedAt });

test("shelves", () => {
  expect(shelfOf(b("a", "A"))).toBe("unread");
  expect(shelfOf(b("a", "A"), p("a", 30))).toBe("reading");
  expect(shelfOf(b("a", "A", { finishedAt: 5 }), p("a", 30))).toBe("finished");
});

test("percent read uses the page count", () => {
  expect(percentRead(b("a", "A"), p("a", 50))).toBe(50);
  expect(percentRead(b("a", "A"))).toBe(0);
});

test("search matches title or author, sort by title or recent", () => {
  const books = [b("1", "Zebra"), b("2", "apple", { lastOpenedAt: 5 }), b("3", "Mango", { author: "Zed" })];
  const progress = new Map([["2", p("2", 10)]]);
  expect(filterBooks(books, progress, { shelf: "all", query: "", sort: "title" }).map((x) => x.id)).toEqual(["2", "3", "1"]);
  expect(filterBooks(books, progress, { shelf: "all", query: "zed", sort: "title" }).map((x) => x.id)).toEqual(["3"]);
  expect(filterBooks(books, progress, { shelf: "reading", query: "", sort: "recent" }).map((x) => x.id)).toEqual(["2"]);
});
```

`test/app/importer.test.ts`:
```ts
// @vitest-environment node
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { openDb } from "../../app/src/db/idb";
import { createRepos } from "../../app/src/db/repos";
import { importPdf, ImportError } from "../../app/src/library/importer";

const sampleFile = () => new File([readFileSync("src/sample/sample.pdf")], "sample.pdf", { type: "application/pdf" });

test("imports a PDF once and reports duplicates", async () => {
  const { books } = createRepos(await openDb("import-test"));
  const deps = { books, makeCover: async () => new Blob(["jpg"]), now: () => 42, newId: () => "id-1" };
  const first = await importPdf(sampleFile(), deps);
  expect(first).toMatchObject({ duplicate: false, book: { id: "id-1", title: "Smart Dark PDF sample", pageCount: 2, addedAt: 42 } });
  expect((await books.file("id-1"))?.size).toBe(sampleFile().size);
  const second = await importPdf(sampleFile(), { ...deps, newId: () => "id-2" });
  expect(second).toMatchObject({ duplicate: true, book: { id: "id-1" } });
});

test("rejects files that are not PDFs", async () => {
  const { books } = createRepos(await openDb("import-test-2"));
  const bad = new File(["hello"], "notes.txt", { type: "text/plain" });
  await expect(importPdf(bad, { books, makeCover: async () => null })).rejects.toMatchObject({ code: "not-pdf" });
  const broken = new File(["%PDF-1.7 garbage"], "broken.pdf", { type: "application/pdf" });
  await expect(importPdf(broken, { books, makeCover: async () => null })).rejects.toBeInstanceOf(ImportError);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run app:test -- filters importer`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement filters and importer**

`app/src/library/filters.ts`:
```ts
import type { Book, Progress } from "../db/repos";

export type Shelf = "all" | "reading" | "unread" | "finished";
export type SortKey = "recent" | "title" | "progress";

export function shelfOf(book: Book, progress?: Progress): Exclude<Shelf, "all"> {
  if (book.finishedAt) return "finished";
  return progress ? "reading" : "unread";
}

export function percentRead(book: Book, progress?: Progress): number {
  if (book.finishedAt) return 100;
  if (!progress || book.pageCount <= 0) return 0;
  return Math.round(Math.min(1, progress.page / book.pageCount) * 100);
}

export function filterBooks(
  books: Book[],
  progress: Map<string, Progress>,
  { shelf, query, sort }: { shelf: Shelf; query: string; sort: SortKey },
): Book[] {
  const q = query.trim().toLocaleLowerCase();
  const list = books.filter((book) => {
    if (shelf !== "all" && shelfOf(book, progress.get(book.id)) !== shelf) return false;
    return !q || book.title.toLocaleLowerCase().includes(q) || book.author.toLocaleLowerCase().includes(q);
  });
  const recent = (b: Book) => Math.max(b.lastOpenedAt ?? 0, progress.get(b.id)?.updatedAt ?? 0, b.addedAt);
  const compare: Record<SortKey, (a: Book, b: Book) => number> = {
    recent: (a, b) => recent(b) - recent(a),
    title: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
    progress: (a, b) => percentRead(b, progress.get(b.id)) - percentRead(a, progress.get(a.id)),
  };
  return list.sort(compare[sort]);
}
```

`app/src/library/importer.ts`:
```ts
import type { Book, BooksRepo } from "../db/repos";
import { openPdf, readBookInfo, type PDFDocumentProxy } from "../reader/pdf";

export class ImportError extends Error {
  constructor(public code: "not-pdf" | "unreadable", message: string) {
    super(message);
    this.name = "ImportError";
  }
}

async function sha256(data: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function importPdf(
  file: File,
  deps: {
    books: BooksRepo;
    makeCover: (doc: PDFDocumentProxy) => Promise<Blob | null>;
    now?: () => number;
    newId?: () => string;
  },
): Promise<{ book: Book; duplicate: boolean }> {
  const bytes = await file.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength)));
  if (!head.includes("%PDF-")) throw new ImportError("not-pdf", `${file.name} is not a PDF`);

  const hash = await sha256(bytes);
  const existing = await deps.books.findByHash(hash);
  if (existing) return { book: existing, duplicate: true };

  let doc: PDFDocumentProxy;
  try {
    doc = await openPdf(new Uint8Array(bytes.slice(0)));
  } catch {
    throw new ImportError("unreadable", `${file.name} could not be opened`);
  }
  try {
    const info = await readBookInfo(doc, file.name);
    const cover = await deps.makeCover(doc).catch(() => null);
    const book: Book = {
      id: deps.newId?.() ?? crypto.randomUUID(),
      hash,
      ...info,
      fileName: file.name,
      fileSize: file.size,
      addedAt: deps.now?.() ?? Date.now(),
      lastOpenedAt: null,
      finishedAt: null,
    };
    await deps.books.add(book, new Blob([bytes], { type: "application/pdf" }), cover);
    return { book, duplicate: false };
  } finally {
    doc.destroy();
  }
}
```

`app/src/library/cover.ts`:
```ts
import type { PDFDocumentProxy } from "../reader/pdf";

// Original colors on purpose: covers should look like the real book.
export async function makeCover(doc: PDFDocumentProxy, width = 360): Promise<Blob | null> {
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / base.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  await page.render({ canvas, viewport }).promise;
  page.cleanup();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}
```

- [ ] **Step 4: Run unit tests**

Run: `npm run app:test`
Expected: all pass.

- [ ] **Step 5: Build the library screen**

`app/src/library/LibraryScreen.tsx`:
```tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { Book, Progress, Repos } from "../db/repos";
import { navigate } from "../router";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { makeCover } from "./cover";
import { filterBooks, percentRead, type Shelf, type SortKey } from "./filters";
import { importPdf, ImportError } from "./importer";
import "./library.css";

const SHELVES: [Shelf, string][] = [["all", "All"], ["reading", "Reading"], ["unread", "Not started"], ["finished", "Finished"]];
const SORTS: [SortKey, string][] = [["recent", "Recent"], ["title", "Title"], ["progress", "Progress"]];

export function LibraryScreen({ repos }: { repos: Repos }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState(new Map<string, Progress>());
  const [covers, setCovers] = useState(new Map<string, string>());
  const [shelf, setShelf] = useState<Shelf>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Book | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function reload() {
    const [all, prog] = await Promise.all([repos.books.all(), repos.progress.all()]);
    setProgress(new Map(prog.map((p) => [p.bookId, p])));
    setBooks(all);
    const urls = new Map<string, string>();
    for (const b of all) {
      const blob = await repos.books.cover(b.id);
      if (blob) urls.set(b.id, URL.createObjectURL(blob));
    }
    setCovers((old) => {
      old.forEach((u) => URL.revokeObjectURL(u));
      return urls;
    });
  }

  useEffect(() => {
    reload();
  }, []);

  async function importFiles(files: FileList | File[]) {
    setBusy(true);
    const notes: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const { book, duplicate } = await importPdf(file, { books: repos.books, makeCover });
        if (duplicate) notes.push(`“${book.title}” is already in your library.`);
      } catch (error) {
        notes.push(error instanceof ImportError ? error.message : `${file.name} could not be imported.`);
      }
    }
    setBusy(false);
    setMessage(notes.join(" "));
    reload();
  }

  const visible = useMemo(
    () => (books ? filterBooks(books, progress, { shelf, query, sort }) : []),
    [books, progress, shelf, query, sort],
  );

  return (
    <div
      class={`library ${dragging ? "is-dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files.length) importFiles(e.dataTransfer.files); }}
    >
      <header class="lib-head">
        <h1>Your library</h1>
        <Button variant="primary" onClick={() => fileInput.current?.click()} disabled={busy}>
          <Icon name="plus" size={18} /> {busy ? "Importing" : "Add PDF"}
        </Button>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden
          onChange={(e) => { const f = e.currentTarget.files; if (f?.length) importFiles(f); e.currentTarget.value = ""; }} />
      </header>

      {books && books.length > 0 && (
        <div class="lib-tools">
          <label class="search">
            <Icon name="search" size={18} />
            <input type="search" placeholder="Search title or author" value={query}
              onInput={(e) => setQuery(e.currentTarget.value)} aria-label="Search title or author" />
          </label>
          <div class="chips" role="tablist" aria-label="Shelves">
            {SHELVES.map(([key, label]) => (
              <button type="button" role="tab" aria-selected={shelf === key} class="chip" onClick={() => setShelf(key)}>{label}</button>
            ))}
          </div>
          <label class="sort">
            Sort
            <select value={sort} onChange={(e) => setSort(e.currentTarget.value as SortKey)}>
              {SORTS.map(([key, label]) => <option value={key}>{label}</option>)}
            </select>
          </label>
        </div>
      )}

      {message && <p class="lib-message" role="status">{message}</p>}

      {books && books.length === 0 && (
        <section class="lib-empty">
          <div class="lib-empty-art"><Icon name="book" size={40} /></div>
          <h2>Add your first book</h2>
          <p>Choose a PDF or drop it here. It stays on this device.</p>
          <Button variant="primary" onClick={() => fileInput.current?.click()}>Choose a PDF</Button>
        </section>
      )}

      <ul class="grid" aria-label="Books">
        {visible.map((book) => {
          const pct = percentRead(book, progress.get(book.id));
          return (
            <li class="card">
              <button type="button" class="card-open" onClick={() => navigate({ name: "reader", bookId: book.id })}>
                <div class="cover">
                  {covers.get(book.id) ? <img src={covers.get(book.id)} alt="" loading="lazy" /> : <Icon name="book" size={32} />}
                </div>
                <span class="card-title">{book.title}</span>
                {book.author && <span class="card-author">{book.author}</span>}
                <span class="bar" aria-label={`${pct}% read`}><span style={{ width: `${pct}%` }} /></span>
              </button>
              <IconButton label={`Remove ${book.title}`} icon="trash" class="card-remove" onClick={() => setToDelete(book)} />
            </li>
          );
        })}
      </ul>

      <Sheet open={!!toDelete} title="Remove book" onClose={() => setToDelete(null)}>
        <p>Remove “{toDelete?.title}” and its reading progress from this device?</p>
        <div class="sheet-actions">
          <Button onClick={() => setToDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={async () => { await repos.books.remove(toDelete!.id); setToDelete(null); reload(); }}>Remove</Button>
        </div>
      </Sheet>
    </div>
  );
}
```

`app/src/library/library.css`:
```css
.library { min-height: 100%; padding: calc(16px + var(--safe-top)) 20px calc(32px + var(--safe-bottom)); max-width: 1180px; margin: 0 auto; }
.library.is-dragging { outline: 2px dashed var(--accent); outline-offset: -10px; border-radius: 20px; }
.lib-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 20px; }
.lib-head h1 { margin: 0; font-size: clamp(26px, 4vw, 34px); letter-spacing: -0.02em; }
.lib-head .btn { display: inline-flex; align-items: center; gap: 6px; }
.lib-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; margin-bottom: 20px; }
.search { flex: 1 1 260px; display: flex; align-items: center; gap: 8px; padding: 0 14px; height: 42px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border); color: var(--muted); }
.search input { flex: 1; min-width: 0; border: 0; background: none; outline: none; color: var(--text); }
.chips { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
.chip { height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--border); background: transparent; cursor: pointer; white-space: nowrap; color: var(--muted); }
.chip[aria-selected="true"] { background: var(--text); color: var(--bg); border-color: transparent; }
.sort { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.sort select { height: 34px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); padding: 0 10px; }
.lib-message { padding: 10px 14px; border-radius: var(--radius-sm); background: var(--surface-2); }
.lib-empty { text-align: center; padding: 12vh 16px; }
.lib-empty-art { display: inline-grid; place-items: center; width: 84px; height: 84px; border-radius: 24px; background: var(--surface-2); color: var(--accent); }
.lib-empty h2 { margin: 18px 0 6px; }
.lib-empty p { margin: 0 0 18px; color: var(--muted); }
.grid { list-style: none; margin: 0; padding: 0; display: grid; gap: 26px 18px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
@media (max-width: 480px) { .grid { grid-template-columns: repeat(2, 1fr); gap: 20px 14px; } }
.card { position: relative; }
.card-open { display: grid; gap: 6px; width: 100%; padding: 0; border: 0; background: none; text-align: start; cursor: pointer; }
.cover { aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden; display: grid; place-items: center; background: var(--surface-2); color: var(--muted); box-shadow: var(--shadow); transition: transform 0.2s var(--ease); }
.card-open:hover .cover { transform: translateY(-3px); }
.cover img { width: 100%; height: 100%; object-fit: cover; }
.card-title { font-weight: 600; line-height: 1.25; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.card-author { color: var(--muted); font-size: 13px; }
.bar { height: 4px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--accent); }
.card-remove { position: absolute; top: 6px; inset-inline-end: 6px; background: rgb(0 0 0 / 0.45); color: #fff; opacity: 0; transition: opacity 0.15s; }
.card:hover .card-remove, .card-remove:focus-visible { opacity: 1; }
@media (hover: none) { .card-remove { opacity: 1; width: 32px; height: 32px; } }
.sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
```

- [ ] **Step 6: E2E test**

`test/app-e2e/library.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("import a PDF, see it in the library, reject duplicates, remove it", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Add your first book" })).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDF" }).click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  const card = page.getByRole("list", { name: "Books" }).getByRole("listitem");
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Smart Dark PDF sample")).toBeVisible();
  await expect(card.locator("img")).toBeVisible();

  const again = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add PDF" }).click();
  await (await again).setFiles("src/sample/sample.pdf");
  await expect(page.getByRole("status")).toContainText("already in your library");

  await page.reload();
  await expect(card).toHaveCount(1);

  await card.getByRole("button", { name: /Remove/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("heading", { name: "Add your first book" })).toBeVisible();
});
```

Run: `npm run app:e2e -- library`
Expected: 2 passed (chromium-desktop, webkit-iphone).

- [ ] **Step 7: Commit**

```bash
git add app/src/library test && git commit -m "feat(app): library with import, covers, search, shelves, sort and remove"
```

---

### Task 7: Reader with page styles and resume

**Files:**
- Create: `app/src/reader/renderer.ts`, `app/src/reader/ReaderScreen.tsx`, `app/src/reader/reader.css`, `app/src/reader/textlayer.css`
- Test: `test/app-e2e/reader.spec.ts`

**Interfaces:**
- Consumes: `openPdf`, `flattenOutline`, `OutlineItem` (Task 4); `chapterProgress`, `currentChapter` (Task 4); `settings`, `saveSetting` (Task 5); `BooksRepo.file/update`, `ProgressRepo.get/save` (Task 3); `createColorMapper`, `createTintMapper`, `THEMES`, `TINTS`, `imageRectsFromCoords`, `processPage` from `src/viewer/smart-invert.js`.
- Produces:
  - `class Renderer { constructor(container: HTMLElement, doc: PDFDocumentProxy, opts: RenderOptions); setOptions(opts: RenderOptions): void; setScale(scale: number): void; scrollToPage(page: number, offset?: number): void; position(): { page: number; offset: number }; onPageChange: (page: number) => void; destroy(): void }`
  - `type RenderOptions = { pageStyle: PageStyle; darkTheme: DarkTheme; imageMode: ImageMode }`
  - `pageBackground(opts): string` (CSS color of an unrendered page)

Port the extension viewer's `PageView` render/release/text-layer logic (`src/viewer/viewer.js`) into `Renderer` as TypeScript, with these changes: options come from `RenderOptions`; `pageStyle === "sepia"` uses `createTintMapper(TINTS.sepia)`; `"original"` skips recoloring; the scroll container is the passed element; fit-width scale computed from container width (max 2.5, min 0.5).

- [ ] **Step 1: Write the failing e2e test**

`test/app-e2e/reader.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";

async function importSample(page: Page) {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
}

const cornerPixel = (page: Page) =>
  page.locator('.page[data-page="1"] canvas').evaluate((c: HTMLCanvasElement) =>
    [...c.getContext("2d")!.getImageData(2, 2, 1, 1).data].slice(0, 3));

test("opens in smart dark, switches to sepia and original", async ({ page }) => {
  await importSample(page);
  await expect(page.locator('.page[data-page="1"] canvas')).toBeVisible();
  expect((await cornerPixel(page)).every((v) => v < 60)).toBe(true);

  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("radio", { name: "Sepia" }).check();
  await expect.poll(async () => (await cornerPixel(page))[0]).toBeGreaterThan(220);
  await page.getByRole("radio", { name: "Original" }).check();
  await expect.poll(async () => (await cornerPixel(page)).join()).toMatch(/^25[0-5],25[0-5],25[0-5]$/);
});

test("remembers the page after leaving and reopening", async ({ page }) => {
  await importSample(page);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await page.waitForTimeout(800); // progress is saved after scrolling settles
  await page.getByRole("button", { name: "Back to library" }).click();
  await expect(page.getByText("Reading", { exact: true })).toBeVisible();
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run app:e2e -- reader`
Expected: FAIL (no reader screen).

- [ ] **Step 3: Implement `renderer.ts`**

```ts
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  THEMES, TINTS, createColorMapper, createTintMapper, imageRectsFromCoords, processPage,
} from "../../../src/viewer/smart-invert.js";
import type { DarkTheme, ImageMode, PageStyle } from "../settings";

export type RenderOptions = { pageStyle: PageStyle; darkTheme: DarkTheme; imageMode: ImageMode };

const MAX_CANVAS_PIXELS = 16_777_216;
const AHEAD = 1200;
const KEEP = 4000;
const GAP = 12;

export function pageBackground(o: RenderOptions) {
  if (o.pageStyle === "original") return "#ffffff";
  const rgb = o.pageStyle === "sepia" ? TINTS.sepia.paper : THEMES[o.darkTheme].bg;
  return `rgb(${rgb.join(" ")})`;
}

class PageSlot {
  div = document.createElement("div");
  canvas: HTMLCanvasElement | null = null;
  textDiv: HTMLDivElement | null = null;
  page: PDFPageProxy | null = null;
  key = "";
  layerScale = 0;
  task: ReturnType<PDFPageProxy["render"]> | null = null;
  textLayer: InstanceType<typeof pdfjs.TextLayer> | null = null;
  constructor(public number: number, public w: number, public h: number) {
    this.div.className = "page";
    this.div.dataset.page = String(number);
  }
  size(scale: number) {
    this.div.style.width = `${Math.floor(this.w * scale)}px`;
    this.div.style.height = `${Math.floor(this.h * scale)}px`;
    this.div.style.setProperty("--scale-factor", String(scale));
  }
  release() {
    this.task?.cancel();
    this.task = null;
    if (this.canvas) {
      this.canvas.width = this.canvas.height = 0;
      this.canvas.remove();
      this.canvas = null;
    }
    this.key = "";
  }
}

export class Renderer {
  private slots: PageSlot[] = [];
  private scale = 1;
  private busy = false;
  private queued = false;
  private mapper: ((r: number, g: number, b: number) => number) | null = null;
  private styleKey = "";
  private current = 1;
  private resizeObserver: ResizeObserver;
  onPageChange: (page: number) => void = () => {};

  constructor(private container: HTMLElement, private doc: PDFDocumentProxy, private opts: RenderOptions) {
    this.container.addEventListener("scroll", this.onScroll, { passive: true });
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.setOptions(opts);
  }

  async init() {
    const first = await this.doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    for (let i = 1; i <= this.doc.numPages; i++) {
      const slot = new PageSlot(i, vp.width, vp.height);
      if (i === 1) slot.page = first;
      this.slots.push(slot);
      this.container.append(slot.div);
    }
    this.fit();
    this.resizeObserver.observe(this.container);
  }

  setOptions(opts: RenderOptions) {
    this.opts = opts;
    if (opts.pageStyle === "dark") this.mapper = createColorMapper(THEMES[opts.darkTheme]);
    else if (opts.pageStyle === "sepia") this.mapper = createTintMapper(TINTS.sepia);
    else this.mapper = null;
    this.styleKey = `${opts.pageStyle}|${opts.darkTheme}|${opts.imageMode}`;
    this.container.style.setProperty("--page-bg", pageBackground(opts));
    this.schedule();
  }

  private fit() {
    const width = this.container.clientWidth - 24;
    if (width <= 0 || !this.slots.length) return;
    const anchor = this.position();
    this.scale = Math.max(0.5, Math.min(2.5, width / this.slots[0].w));
    for (const s of this.slots) s.size(this.scale);
    this.scrollToPage(anchor.page, anchor.offset);
    this.schedule();
  }

  setScale(scale: number) {
    const anchor = this.position();
    this.scale = Math.max(0.5, Math.min(4, scale));
    for (const s of this.slots) s.size(this.scale);
    this.scrollToPage(anchor.page, anchor.offset);
    this.schedule();
  }

  position() {
    const top = this.container.scrollTop;
    let slot = this.slots[0];
    for (const s of this.slots) {
      if (s.div.offsetTop - GAP <= top) slot = s;
      else break;
    }
    if (!slot) return { page: 1, offset: 0 };
    const offset = (top - slot.div.offsetTop) / Math.max(1, slot.div.offsetHeight);
    return { page: slot.number, offset: Math.min(1, Math.max(0, offset)) };
  }

  scrollToPage(page: number, offset = 0) {
    const slot = this.slots[Math.min(this.slots.length, Math.max(1, page)) - 1];
    if (!slot) return;
    this.container.scrollTop = slot.div.offsetTop + offset * slot.div.offsetHeight - (offset ? 0 : GAP);
    this.onScroll();
  }

  private onScroll = () => {
    const mid = this.container.scrollTop + this.container.clientHeight / 3;
    let page = 1;
    for (const s of this.slots) {
      if (s.div.offsetTop <= mid) page = s.number;
      else break;
    }
    if (page !== this.current) {
      this.current = page;
      this.onPageChange(page);
    }
    this.schedule();
  };

  private schedule() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.renderNext();
    });
  }

  private keyFor() {
    return `${this.scale}|${devicePixelRatio}|${this.styleKey}`;
  }

  private async renderNext() {
    if (this.busy) return;
    const top = this.container.scrollTop;
    const bottom = top + this.container.clientHeight;
    let best: PageSlot | null = null;
    let bestDistance = Infinity;
    for (const s of this.slots) {
      const sTop = s.div.offsetTop;
      const sBottom = sTop + s.div.offsetHeight;
      const d = sBottom < top ? top - sBottom : sTop > bottom ? sTop - bottom : 0;
      if (d > KEEP) { if (s.canvas) s.release(); continue; }
      if (d > AHEAD || s.key === this.keyFor()) continue;
      if (d < bestDistance) { best = s; bestDistance = d; }
    }
    if (!best) return;
    this.busy = true;
    try {
      await this.renderSlot(best);
    } catch (error) {
      if ((error as Error)?.name !== "RenderingCancelledException") console.error(error);
      best.key = this.keyFor();
    } finally {
      this.busy = false;
    }
    this.schedule();
  }

  private async renderSlot(slot: PageSlot) {
    slot.page ??= await this.doc.getPage(slot.number);
    const key = this.keyFor();
    const viewport = slot.page.getViewport({ scale: this.scale });
    let out = devicePixelRatio || 1;
    if (viewport.width * viewport.height * out * out > MAX_CANVAS_PIXELS) {
      out = Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height));
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width * out);
    canvas.height = Math.floor(viewport.height * out);
    const recolor = this.mapper !== null;
    slot.task = slot.page.render({
      canvas,
      viewport,
      transform: out !== 1 ? [out, 0, 0, out, 0, 0] : undefined,
      recordImages: recolor,
    });
    await slot.task.promise;
    slot.task = null;
    if (recolor && this.mapper) {
      const ctx = canvas.getContext("2d")!;
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rects = imageRectsFromCoords(slot.page.imageCoordinates, canvas.width, canvas.height);
      processPage(image, { mapColor: this.mapper, rects, imageMode: this.opts.imageMode });
      ctx.putImageData(image, 0, 0);
    }
    if (slot.canvas) slot.canvas.replaceWith(canvas);
    else slot.div.prepend(canvas);
    slot.canvas = canvas;
    slot.key = key;
    if (slot.layerScale !== this.scale) await this.renderText(slot, viewport);
  }

  private async renderText(slot: PageSlot, viewport: ReturnType<PDFPageProxy["getViewport"]>) {
    slot.layerScale = this.scale;
    slot.textLayer?.cancel();
    slot.textDiv?.remove();
    slot.textDiv = document.createElement("div");
    slot.textDiv.className = "textLayer";
    slot.div.append(slot.textDiv);
    slot.textLayer = new pdfjs.TextLayer({
      textContentSource: slot.page!.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
      container: slot.textDiv,
      viewport,
    });
    await slot.textLayer.render().catch(() => {});
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.container.removeEventListener("scroll", this.onScroll);
    for (const s of this.slots) {
      s.release();
      s.textLayer?.cancel();
      s.page?.cleanup();
    }
    this.slots = [];
  }
}
```

- [ ] **Step 4: Implement `ReaderScreen.tsx` with bars, page input, appearance sheet**

```tsx
import { useEffect, useRef, useState } from "preact/hooks";
import type { Book, Repos } from "../db/repos";
import { navigate } from "../router";
import { saveSetting, settings, type DarkTheme, type ImageMode, type PageStyle } from "../settings";
import { IconButton } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { chapterProgress, currentChapter } from "./chapters";
import { flattenOutline, openPdf, type OutlineItem, type PDFDocumentProxy } from "./pdf";
import { Renderer } from "./renderer";
import "./reader.css";
import "./textlayer.css";

const STYLES: [PageStyle, string][] = [["original", "Original"], ["sepia", "Sepia"], ["dark", "Smart dark"]];
const DARK_THEMES: [DarkTheme, string][] = [["dark", "Dark"], ["dim", "Dim"], ["black", "Black"], ["warm", "Warm"], ["slate", "Slate"]];
const IMAGE_MODES: [ImageMode, string][] = [["smart", "Smart"], ["keep", "Keep"], ["dim", "Dim"], ["invert", "Darken"]];

export function ReaderScreen({ repos, bookId }: { repos: Repos; bookId: string }) {
  const scroller = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [sheet, setSheet] = useState<"toc" | "appearance" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let doc: PDFDocumentProxy | null = null;
    let cancelled = false;
    let saveTimer = 0;
    (async () => {
      const [b, blob, saved] = await Promise.all([repos.books.get(bookId), repos.books.file(bookId), repos.progress.get(bookId)]);
      if (!b || !blob) return setError("This book is no longer in your library.");
      setBook(b);
      repos.books.update(bookId, { lastOpenedAt: Date.now() });
      doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
      if (cancelled) return doc.destroy();
      const r = new Renderer(scroller.current!, doc, {
        pageStyle: settings.pageStyle.value, darkTheme: settings.darkTheme.value, imageMode: settings.imageMode.value,
      });
      renderer.current = r;
      r.onPageChange = (p) => { setPage(p); setPageInput(String(p)); };
      await r.init();
      if (saved) r.scrollToPage(saved.page, saved.offset);
      scroller.current!.addEventListener("scroll", () => {
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          const pos = r.position();
          repos.progress.save(bookId, pos.page, pos.offset);
          if (pos.page === doc!.numPages) repos.books.update(bookId, { finishedAt: Date.now() });
        }, 400);
      }, { passive: true });
      setOutline(await flattenOutline(doc).catch(() => []));
    })().catch(() => setError("This PDF could not be opened."));
    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
      renderer.current?.destroy();
      renderer.current = null;
      doc?.destroy();
    };
  }, [bookId]);

  // Re-render when appearance settings change.
  useEffect(() => {
    renderer.current?.setOptions({
      pageStyle: settings.pageStyle.value, darkTheme: settings.darkTheme.value, imageMode: settings.imageMode.value,
    });
  }, [settings.pageStyle.value, settings.darkTheme.value, settings.imageMode.value]);

  const total = book?.pageCount ?? 0;
  const chapter = currentChapter(outline, page, total);
  const chapterPct = chapterProgress(outline, page, total);
  const go = (p: number) => renderer.current?.scrollToPage(Math.min(total, Math.max(1, p)));

  return (
    <div class="reader" data-style={settings.pageStyle.value}>
      <header class="reader-top">
        <IconButton label="Back to library" icon="back" onClick={() => navigate({ name: "library" })} />
        <div class="reader-title">
          <strong>{book?.title ?? ""}</strong>
          {chapter && <span>{chapter.item.title}</span>}
        </div>
        <IconButton label="Contents" icon="list" onClick={() => setSheet("toc")} disabled={!outline.length} />
        <IconButton label="Appearance" icon="palette" onClick={() => setSheet("appearance")} />
      </header>

      {error ? <p class="reader-error" role="alert">{error}</p> : <div class="reader-scroll" ref={scroller} tabIndex={0} />}

      <footer class="reader-bottom">
        <IconButton label="Previous page" icon="chevronLeft" onClick={() => go(page - 1)} disabled={page <= 1} />
        <label class="page-field">
          <input aria-label="Page number" inputMode="numeric" value={pageInput}
            onInput={(e) => setPageInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && go(Number(pageInput))}
            onBlur={() => setPageInput(String(page))} />
          <span>of {total}</span>
        </label>
        <IconButton label="Next page" icon="chevronRight" onClick={() => go(page + 1)} disabled={page >= total} />
        {chapterPct !== null && (
          <span class="chapter-progress" aria-label={`Chapter ${Math.round(chapterPct * 100)}% read`}>
            <span style={{ width: `${chapterPct * 100}%` }} />
          </span>
        )}
      </footer>

      <Sheet open={sheet === "toc"} title="Contents" onClose={() => setSheet(null)}>
        <ol class="toc">
          {outline.map((item, i) => (
            <li style={{ paddingInlineStart: `${item.depth * 16}px` }}>
              <button type="button" aria-current={chapter?.item === item ? "true" : undefined}
                onClick={() => { go(item.page); setSheet(null); }}>
                <span>{item.title}</span><span class="toc-page">{item.page}</span>
              </button>
            </li>
          ))}
        </ol>
      </Sheet>

      <Sheet open={sheet === "appearance"} title="Appearance" onClose={() => setSheet(null)}>
        <fieldset class="seg">
          <legend>Page</legend>
          {STYLES.map(([value, label]) => (
            <label><input type="radio" name="pageStyle" checked={settings.pageStyle.value === value}
              onChange={() => saveSetting("pageStyle", value)} />{label}</label>
          ))}
        </fieldset>
        {settings.pageStyle.value === "dark" && (
          <>
            <fieldset class="seg">
              <legend>Dark theme</legend>
              {DARK_THEMES.map(([value, label]) => (
                <label><input type="radio" name="darkTheme" checked={settings.darkTheme.value === value}
                  onChange={() => saveSetting("darkTheme", value)} />{label}</label>
              ))}
            </fieldset>
            <fieldset class="seg">
              <legend>Images</legend>
              {IMAGE_MODES.map(([value, label]) => (
                <label><input type="radio" name="imageMode" checked={settings.imageMode.value === value}
                  onChange={() => saveSetting("imageMode", value)} />{label}</label>
              ))}
            </fieldset>
          </>
        )}
      </Sheet>
    </div>
  );
}
```

`app/src/reader/reader.css`:
```css
.reader { position: fixed; inset: 0; display: grid; grid-template-rows: auto 1fr auto; background: var(--bg); }
.reader[data-style="dark"] { --bg: #0f1013; }
.reader-top, .reader-bottom { display: flex; align-items: center; gap: 4px; padding: 6px 8px; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); z-index: 2; }
.reader-top { padding-top: calc(6px + var(--safe-top)); border-bottom: 1px solid var(--border); }
.reader-bottom { position: relative; justify-content: center; padding-bottom: calc(6px + var(--safe-bottom)); border-top: 1px solid var(--border); }
.reader-title { flex: 1; min-width: 0; display: grid; text-align: center; }
.reader-title strong, .reader-title span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.reader-title span { font-size: 12px; color: var(--muted); }
.reader-scroll { overflow: auto; display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 12px; outline: none; overscroll-behavior: contain; }
.reader-error { padding: 24px; text-align: center; }
.page { position: relative; flex: none; background: var(--page-bg, #fff); border-radius: 4px; box-shadow: var(--shadow); --user-unit: 1; --total-scale-factor: calc(var(--scale-factor) * var(--user-unit)); --scale-round-x: 1px; --scale-round-y: 1px; }
.page canvas { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 4px; }
.page-field { display: flex; align-items: center; gap: 6px; color: var(--muted); }
.page-field input { width: 52px; height: 34px; text-align: center; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.chapter-progress { position: absolute; inset: 0 0 auto; height: 2px; background: transparent; }
.chapter-progress span { display: block; height: 100%; background: var(--accent); transition: width 0.25s var(--ease); }
.toc { list-style: none; margin: 0; padding: 0; }
.toc button { display: flex; width: 100%; gap: 12px; justify-content: space-between; padding: 12px 8px; border: 0; border-radius: 10px; background: none; text-align: start; cursor: pointer; }
.toc button:hover, .toc button[aria-current="true"] { background: var(--surface-2); }
.toc-page { color: var(--muted); font-variant-numeric: tabular-nums; }
.seg { border: 0; padding: 0; margin: 12px 0; display: flex; flex-wrap: wrap; gap: 6px; }
.seg legend { width: 100%; margin-bottom: 8px; color: var(--muted); font-size: 13px; }
.seg label { position: relative; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--border); cursor: pointer; }
.seg input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.seg label:has(input:checked) { background: var(--text); color: var(--bg); border-color: transparent; }
.seg label:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
```

`app/src/reader/textlayer.css`: copy the `.textLayer` rules from `src/viewer/viewer.css` (the block starting at `/* Text layer: copied from pdf.js (Apache-2.0)…` through `.textLayer.selecting .endOfContent`), unchanged except `--accent` already exists in app tokens.

- [ ] **Step 5: Run e2e**

Run: `npm run app:e2e`
Expected: all specs pass on both projects. If the WebKit corner pixel read differs by ±2 because of canvas readback noise, the assertions already allow it.

- [ ] **Step 6: Commit**

```bash
git add app/src/reader test/app-e2e && git commit -m "feat(app): reader with smart dark, sepia, original, resume and page navigation"
```

---

### Task 8: Contents navigation and keyboard/touch polish

**Files:**
- Modify: `app/src/reader/ReaderScreen.tsx` (keyboard shortcuts, hide bars on tap for touch)
- Test: `test/app-e2e/toc.spec.ts`

**Interfaces:**
- Consumes: everything from Task 7.
- Produces: keyboard: `ArrowRight`/`j` next page, `ArrowLeft`/`k` previous, `Home`/`End`, `Escape` closes sheets; tap in the page area toggles `.reader.bars-hidden` on touch devices.

- [ ] **Step 1: Write the failing test**

`test/app-e2e/toc.spec.ts`:
```ts
import { expect, test } from "@playwright/test";

test("contents jumps to a chapter and shows chapter progress", async ({ page }) => {
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("dialog", { name: "Contents" }).getByRole("button", { name: /Page two/ }).click();
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await expect(page.locator(".reader-title span")).toHaveText("Page two");
});

test("keyboard navigation on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard only");
  await page.goto("./");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Add PDF|Choose a PDF/ }).first().click();
  await (await chooser).setFiles("src/sample/sample.pdf");
  await page.getByRole("list", { name: "Books" }).getByText("Smart Dark PDF sample").click();
  await page.locator(".reader-scroll").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Page number")).toHaveValue("2");
  await page.keyboard.press("Home");
  await expect(page.getByLabel("Page number")).toHaveValue("1");
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npm run app:e2e -- toc`
Expected: keyboard test FAILS (no shortcuts yet); contents test passes from Task 7.

- [ ] **Step 3: Implement shortcuts and tap-to-hide** (inside `ReaderScreen`, after the appearance effect)

```tsx
const [barsHidden, setBarsHidden] = useState(false);

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (sheet || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const map: Record<string, () => void> = {
      ArrowRight: () => go(page + 1), j: () => go(page + 1),
      ArrowLeft: () => go(page - 1), k: () => go(page - 1),
      Home: () => go(1), End: () => go(total),
    };
    const action = map[e.key];
    if (action) { e.preventDefault(); action(); }
  };
  addEventListener("keydown", onKey);
  return () => removeEventListener("keydown", onKey);
}, [page, total, sheet]);
```
Change the root element to `<div class={`reader ${barsHidden ? "bars-hidden" : ""}`} …>` and give the scroll container `onClick={(e) => { if (matchMedia("(hover: none)").matches && !(e.target as Element).closest("a, button")) setBarsHidden((v) => !v); }}`.

Add to `reader.css`:
```css
.reader-top, .reader-bottom { transition: transform 0.25s var(--ease), opacity 0.25s; }
.reader.bars-hidden .reader-top { transform: translateY(-100%); opacity: 0; pointer-events: none; }
.reader.bars-hidden .reader-bottom { transform: translateY(100%); opacity: 0; pointer-events: none; }
```

- [ ] **Step 4: Run all tests**

Run: `npm run app:test && npm run app:e2e && npm test && npm run e2e`
Expected: everything green on both Playwright projects; extension suites unchanged.

- [ ] **Step 5: Visual check and commit**

Screenshot the library and reader on both projects (`npx playwright test --update-snapshots` is not used; take manual screenshots with `page.screenshot` into `test/output/`) and review them for spacing, contrast and alignment. Then:

```bash
git add -A && git commit -m "feat(app): contents navigation, keyboard shortcuts, tap to hide bars"
```

---

## Self-review

- Spec coverage for this plan: library with import ✔ (T6), covers ✔ (T6), filters ✔ (T6), resume ✔ (T7), chapter progress ✔ (T4, T7), TOC ✔ (T7, T8), page navigation ✔ (T7, T8), themes light/dark/sepia + smart dark ✔ (T2, T5, T7). Everything else in the roadmap belongs to plans 2 to 7.
- Type names checked across tasks: `Book`, `Progress`, `Repos`, `OutlineItem`, `RenderOptions`, `PageStyle`, `DarkTheme`, `ImageMode` are defined once and reused with the same names.
- Smoke test from Task 1 is rewritten in Task 5 because `App` gains a required `repos` prop; the step says so explicitly.
