// Reader343 desktop app (Electron main process).
// Serves the built web app over a private app:// protocol, opens PDFs passed
// by the OS (double-click, "Open with", dock drop), and adds native menus.
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from "electron";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..", "app-dist");
const pkg = JSON.parse(await readFile(join(here, "..", "package.json"), "utf8"));
const UPDATE_REPO = pkg.desktop?.updateRepo ?? ""; // "owner/repo" on GitHub, empty = updates off

// Content Security Policy for the app: only its own files, plus the opt-in book
// lookup services, the update check, and the natural-voice model: from the web
// app's site, or from Hugging Face if that fails (weights only; every script is
// the app's own).
// Tests of the natural voices read the speech model from a local server instead of Hugging Face.
const TEST_ORIGIN = /^http:\/\/localhost:\d+$/.test(process.env.SMART_DARK_TEST_ORIGIN ?? "") ? ` ${process.env.SMART_DARK_TEST_ORIGIN}` : "";
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  // blob: for styles, fonts, sound and frames: the sections of an e-book are shown from the book's own files.
  // Scripts stay limited to the app's own, so a script inside a book does not run.
  "style-src 'self' 'unsafe-inline' blob:",
  "media-src 'self' blob:",
  "frame-src 'self' blob:",
  "img-src 'self' data: blob: https://covers.openlibrary.org https://books.google.com",
  "font-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "connect-src 'self' data: blob: https://en.wiktionary.org https://openlibrary.org https://covers.openlibrary.org https://www.googleapis.com https://books.google.com https://smart-dark-app.vercel.app https://huggingface.co https://*.hf.co" + TEST_ORIGIN,
  "object-src 'none'",
  "base-uri 'none'",
  // 'self', not 'none': a section of an e-book is a frame made by the app, and Safari's engine applies this
  // rule to such frames too. Other sites still cannot put the app in a frame.
  "frame-ancestors 'self'",
].join("; ");

// The app was called Smart Dark Reader before October 2026, and Electron names the data
// folder after the product. A library made under the old name stays where it is.
const legacyData = join(app.getPath("appData"), "Smart Dark Reader");
if (app.isPackaged && !app.commandLine.hasSwitch("user-data-dir") && existsSync(legacyData)) {
  app.setPath("userData", legacyData);
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

// ---------- files opened by the operating system ----------

let win = null;
let rendererReady = false;
const pendingFiles = [];

// The files the app opens: PDFs, and e-books (EPUB, MOBI, FB2, CBZ).
const isPdfPath = (p) => typeof p === "string" && [".pdf", ".epub", ".mobi", ".azw", ".azw3", ".fb2", ".fbz", ".cbz"].includes(extname(p).toLowerCase());

async function openPdfPath(path) {
  try {
    const bytes = await readFile(path);
    const file = { name: basename(path), bytes };
    if (win && rendererReady) {
      win.webContents.send("desktop:open-file", file);
      if (win.isMinimized()) win.restore();
      win.focus();
    } else pendingFiles.push(file);
    app.addRecentDocument(path);
  } catch (error) {
    dialog.showErrorBox("Could not open the file", `${basename(path)}\n\n${error.message}`);
  }
}

// macOS: double-click, "Open with", dropping on the dock icon (can fire before ready).
app.on("open-file", (event, path) => {
  event.preventDefault();
  if (isPdfPath(path)) openPdfPath(path);
});

// Windows/Linux: the path arrives as an argument, to this or a second instance.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", (_e, argv) => {
  argv.filter(isPdfPath).forEach(openPdfPath);
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ---------- window ----------

const stateFile = () => join(app.getPath("userData"), "window-state.json");

async function loadBounds() {
  try {
    return JSON.parse(await readFile(stateFile(), "utf8"));
  } catch {
    return { width: 1240, height: 860 };
  }
}

async function createWindow() {
  const bounds = await loadBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 480,
    title: "Reader343",
    backgroundColor: "#0e0f11",
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  win.once("ready-to-show", () => win.show());
  win.on("close", () => writeFile(stateFile(), JSON.stringify(win.getBounds())).catch(() => {}));
  win.on("closed", () => {
    win = null;
    rendererReady = false;
  });

  // Links in PDFs and the app open in the user's browser; the window never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("app://")) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  await win.loadURL("app://bundle/index.html");
}

// ---------- menus ----------

async function chooseFiles() {
  const result = await dialog.showOpenDialog(win, {
    title: "Open PDF",
    filters: [{ name: "PDF and e-books", extensions: ["pdf", "epub", "mobi", "azw", "azw3", "fb2", "fbz", "cbz"] }],
    properties: ["openFile", "multiSelections"],
  });
  if (!result.canceled) result.filePaths.forEach(openPdfPath);
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "Open PDF…", accelerator: "CmdOrCtrl+O", click: chooseFiles },
        { role: "recentDocuments", submenu: [{ role: "clearRecentDocuments" }] },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Library", accelerator: "CmdOrCtrl+L", click: () => win?.webContents.send("desktop:navigate", "#/") },
        { label: "Reading stats", click: () => win?.webContents.send("desktop:navigate", "#/stats") },
        { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => win?.webContents.send("desktop:navigate", "#/settings") },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }, { role: "reload" }]),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Check for updates…", click: () => win?.webContents.send("desktop:navigate", "#/settings") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- update check (GitHub Releases, read only) ----------

const newer = (a, b) => {
  const pa = a.replace(/^v/, "").split(".").map(Number);
  const pb = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

async function checkForUpdates() {
  if (!UPDATE_REPO) return { status: "off", current: app.getVersion() };
  const res = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "SmartDarkReader" },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
  const release = await res.json();
  const latest = String(release.tag_name ?? "");
  return newer(latest, app.getVersion())
    ? { status: "available", current: app.getVersion(), latest, url: release.html_url }
    : { status: "current", current: app.getVersion(), latest };
}

// ---------- start ----------

app.whenReady().then(async () => {
  // Serve app-dist over app://bundle/, never anything outside it.
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    const file = normalize(join(appRoot, decodeURIComponent(pathname)));
    if (!file.startsWith(appRoot)) return new Response("Not found", { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (file.endsWith(".html")) headers.set("Content-Security-Policy", CSP);
    if (file.endsWith(".mjs")) headers.set("Content-Type", "text/javascript");
    // Cross-origin isolation, as on the web (vercel.json): the natural voices need threads.
    headers.set("Cross-Origin-Opener-Policy", "same-origin");
    headers.set("Cross-Origin-Embedder-Policy", "credentialless");
    return new Response(res.body, { status: res.status, headers });
  });

  ipcMain.handle("desktop:ready", () => {
    rendererReady = true;
    return pendingFiles.splice(0);
  });
  ipcMain.handle("desktop:open-dialog", chooseFiles);
  ipcMain.handle("desktop:check-updates", () => checkForUpdates());
  ipcMain.handle("desktop:open-external", (_e, url) => {
    if (/^https:\/\/github\.com\//.test(url)) shell.openExternal(url);
  });

  process.argv.slice(1).filter(isPdfPath).forEach(openPdfPath);
  buildMenu();
  await createWindow();
  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
