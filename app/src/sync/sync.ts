import { signal } from "@preact/signals";
import type { Repos } from "../db/repos";
import { syncFolder, type SyncFolder, type SyncSummary } from "./folderSync";

/**
 * The folder the person chose, and when to sync with it. Folder access exists in Chrome and Edge on
 * computers and in the desktop app (File System Access API); elsewhere the feature is not offered.
 * What is kept between rounds lives in the settings store under keys that start with "sync" (backups skip them).
 */
type Access = "granted" | "prompt" | "denied";
type DirHandle = FileSystemDirectoryHandle & {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
  queryPermission?(options: { mode: "readwrite" }): Promise<Access>;
  requestPermission?(options: { mode: "readwrite" }): Promise<Access>;
};
type Picker = (options: { id: string; mode: "readwrite" }) => Promise<DirHandle>;
const picker = () => (globalThis as { showDirectoryPicker?: Picker }).showDirectoryPicker;

export const syncSupported = () => typeof picker() === "function";

export type SyncStatus = {
  /** The chosen folder's name, or null when sync is off. */
  folder: string | null;
  state: "off" | "idle" | "syncing" | "needs-permission" | "failed";
  last: (SyncSummary & { at: number }) | null;
};
export const syncStatus = signal<SyncStatus>({ folder: null, state: "off", last: null });

let handle: DirHandle | null = null;
let running: Promise<SyncSummary | null> | null = null;

/** The folder as the sync sees it. */
export function folderOf(root: FileSystemDirectoryHandle): SyncFolder {
  const dir = async (parts: string[], create: boolean) => {
    let at = root;
    for (const part of parts) at = await at.getDirectoryHandle(part, { create });
    return at as DirHandle;
  };
  const split = (path: string) => {
    const parts = path.split("/");
    return { parts: parts.slice(0, -1), name: parts.at(-1)! };
  };
  return {
    async list(name) {
      try {
        const names: string[] = [];
        for await (const [entry, item] of (await dir([name], false)).entries()) if (item.kind === "file") names.push(entry);
        return names;
      } catch {
        return [];
      }
    },
    async read(path) {
      try {
        const { parts, name } = split(path);
        const file = await (await (await dir(parts, false)).getFileHandle(name)).getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async write(path, data) {
      const { parts, name } = split(path);
      const file = await (await dir(parts, true)).getFileHandle(name, { create: true });
      // Written beside the old file and swapped in when closed: another computer never reads half a file.
      const out = await file.createWritable();
      await out.write(data as Uint8Array<ArrayBuffer>);
      await out.close();
    },
  };
}

/**
 * Where the files go inside the chosen folder. A folder that already is a sync folder (or is named for the
 * app) is used as it is; any other one gets a "Reader343" folder inside, so "Documents" is not filled with
 * loose files, and a second computer that picks the same place finds the same folder.
 */
async function rootOf(chosen: DirHandle): Promise<DirHandle> {
  if (/reader343/i.test(chosen.name)) return chosen;
  try {
    await chosen.getDirectoryHandle("state");
    return chosen;
  } catch {
    return (await chosen.getDirectoryHandle("Reader343", { create: true })) as DirHandle;
  }
}

async function access(ask: boolean): Promise<Access> {
  if (!handle) return "denied";
  try {
    let state = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    // Asking shows the browser's question, which it only allows from a click.
    if (state === "prompt" && ask) state = (await handle.requestPermission?.({ mode: "readwrite" })) ?? "granted";
    return state;
  } catch {
    return "prompt";
  }
}

/** Reads the remembered folder when the app starts. */
export async function initSync(repos: Repos) {
  if (!syncSupported()) return;
  handle = await repos.settings.get<DirHandle | null>("syncFolder", null);
  if (!handle?.name) return void (handle = null);
  const last = await repos.settings.get<SyncStatus["last"]>("syncLast", null);
  syncStatus.value = { folder: handle.name, state: (await access(false)) === "granted" ? "idle" : "needs-permission", last };
}

/** One round of sync. `ask`: called from a click, so the browser may ask for the folder again. */
export function syncNow(repos: Repos, { ask = false } = {}): Promise<SyncSummary | null> {
  if (!handle) return Promise.resolve(null);
  running ??= (async () => {
    const folder = handle!;
    if ((await access(ask)) !== "granted") {
      syncStatus.value = { ...syncStatus.value, state: "needs-permission" };
      return null;
    }
    syncStatus.value = { ...syncStatus.value, state: "syncing" };
    try {
      let device = await repos.settings.get<string>("syncDevice", "");
      if (!device) await repos.settings.set("syncDevice", (device = crypto.randomUUID()));
      const memory = {
        device,
        known: await repos.settings.get<string[]>("syncKnown", []),
        deleted: await repos.settings.get<Record<string, number>>("syncDeleted", {}),
      };
      const done = await syncFolder(repos, folderOf(await rootOf(folder)), memory);
      const last = { ...done.summary, at: Date.now() };
      await repos.settings.set("syncKnown", done.known);
      await repos.settings.set("syncDeleted", done.deleted);
      await repos.settings.set("syncLast", last);
      if (handle === folder) syncStatus.value = { folder: folder.name, state: "idle", last };
      return done.summary;
    } catch (error) {
      console.error("Sync failed", error);
      if (handle === folder) syncStatus.value = { ...syncStatus.value, state: "failed" };
      return null;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** A quiet round when the library opens: only if the folder may be used without asking, and not more often than every two minutes. */
export function autoSync(repos: Repos) {
  const { state, last } = syncStatus.value;
  if (!handle || state === "syncing" || state === "needs-permission") return;
  if (last && Date.now() - last.at < 2 * 60 * 1000) return;
  syncNow(repos);
}

/** Lets the person pick the folder (from a click), remembers it and syncs. False when they closed the picker. */
export async function chooseSyncFolder(repos: Repos): Promise<boolean> {
  let chosen: DirHandle;
  try {
    chosen = await picker()!({ id: "reader343-sync", mode: "readwrite" });
  } catch {
    return false; // closed without choosing
  }
  handle = chosen;
  await repos.settings.set("syncFolder", chosen);
  // What was remembered belongs to the folder before: a new folder starts clean.
  await repos.settings.set("syncKnown", []);
  await repos.settings.set("syncDeleted", {});
  await repos.settings.set("syncLast", null);
  syncStatus.value = { folder: chosen.name, state: "idle", last: null };
  await syncNow(repos, { ask: true });
  return true;
}

/** Stops syncing. The files in the folder stay where they are. */
export async function stopSync(repos: Repos) {
  handle = null;
  await repos.settings.set("syncFolder", null);
  await repos.settings.set("syncLast", null);
  syncStatus.value = { folder: null, state: "off", last: null };
}
