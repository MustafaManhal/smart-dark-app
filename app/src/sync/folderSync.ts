import type { Bookmark, BookAnnotations } from "../db/annotations";
import type { Drawing } from "../db/drawings";
import type { Book, Progress, Repos } from "../db/repos";
import type { ReviewState } from "../db/reviews";
import type { Session } from "../db/sessions";

/**
 * Sync between a person's computers through a folder they chose (inside iCloud Drive, Dropbox, OneDrive…).
 * The app only reads and writes files in that folder; the folder's own service carries them.
 *
 *   books/<hash>.pdf     each book once
 *   covers/<hash>        its cover picture
 *   state/<device>.json  what one computer knows: books, reading places, marks, drawings, reviews, sessions
 *
 * Every computer writes only its own state file, so two computers never write the same file. A sync reads
 * the other computers' files, merges them into this library (the newer change of a mark wins), then writes
 * this computer's file. A removed mark is remembered with the time it was removed, so it is not brought back.
 */
export type SyncFolder = {
  /** Names of the files in a subfolder. Empty when the subfolder is not there. */
  list(dir: string): Promise<string[]>;
  /** The file's bytes, or null when it is missing or cannot be read yet (a cloud file not downloaded). */
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, data: Uint8Array): Promise<void>;
};

const FORMAT = "reader343-sync";
const VERSION = 1;
/** How long a removal is remembered. A computer that stayed away longer may bring an old mark back. */
const KEEP_REMOVALS = 365 * 24 * 60 * 60 * 1000;

type SyncedBook = Omit<Book, "password">;
export type DeviceState = {
  format: typeof FORMAT;
  version: number;
  device: string;
  savedAt: number;
  books: SyncedBook[];
  progress: Progress[];
  annotations: BookAnnotations;
  drawings: Drawing[];
  reviews: ReviewState[];
  sessions: Session[];
  /** hash -> mime type of the cover in covers/ */
  covers: Record<string, string>;
  /** What was removed, and when: "highlights:<id>", "drawings:<id>", "bookmarks:<hash>:<page>", "book:<hash>". */
  deleted: Record<string, number>;
};

export type SyncSummary = {
  /** Books that came from other computers. */
  booksAdded: number;
  /** Marks, notes, drawings and bookmarks that came or changed. */
  received: number;
  /** Things removed here because they were removed elsewhere. */
  removed: number;
  /** Books written to the folder. */
  booksSent: number;
  /** Books other computers have whose file is not in the folder yet. */
  waiting: number;
  /** Other computers found in the folder. */
  devices: number;
};

type Stamped = { id: string; bookId: string; createdAt: number; updatedAt?: number };
const MARK_STORES = ["highlights", "notes", "stickies"] as const;
const time = (r: { createdAt: number; updatedAt?: number }) => r.updatedAt ?? r.createdAt;
/** The parts of a book's record that travel. The rest belongs to the computer (its id, when it was added). */
const BOOK_FIELDS = ["title", "author", "favorite", "tags", "rotation", "crop", "formValues", "finishedAt", "lastOpenedAt"] as const;

async function localState(repos: Repos) {
  const [books, progress, annotations, drawings, reviews, sessions] = await Promise.all([
    repos.books.all(), repos.progress.all(), repos.annotations.all(), repos.drawings.all(), repos.reviews.all(), repos.sessions.all(),
  ]);
  return { books, progress, annotations, drawings, reviews, sessions };
}

/** Every thing this library has that can be removed, by the key its removal is remembered under. */
function keysOf(state: Awaited<ReturnType<typeof localState>>): Set<string> {
  const hash = new Map(state.books.map((b) => [b.id, b.hash]));
  const keys = new Set<string>();
  for (const book of state.books) keys.add(`book:${book.hash}`);
  for (const store of MARK_STORES) for (const r of state.annotations[store]) keys.add(`${store}:${r.id}`);
  for (const b of state.annotations.bookmarks) if (hash.has(b.bookId)) keys.add(`bookmarks:${hash.get(b.bookId)}:${b.page}`);
  for (const d of state.drawings) keys.add(`drawings:${d.id}`);
  return keys;
}

function parseState(bytes: Uint8Array | null): DeviceState | null {
  if (!bytes) return null;
  try {
    const state = JSON.parse(new TextDecoder().decode(bytes)) as DeviceState;
    return state?.format === FORMAT && state.version <= VERSION && Array.isArray(state.books) ? state : null;
  } catch {
    return null; // half written, or a conflicted copy
  }
}

/**
 * One round of sync. `known` and `deleted` are what this computer remembered at the end of its last round
 * (kept in its settings); the new values come back to be kept for the next one.
 */
export async function syncFolder(
  repos: Repos,
  folder: SyncFolder,
  memory: { device: string; known: string[]; deleted: Record<string, number> },
  { now = Date.now } = {},
): Promise<{ summary: SyncSummary; known: string[]; deleted: Record<string, number> }> {
  const summary: SyncSummary = { booksAdded: 0, received: 0, removed: 0, booksSent: 0, waiting: 0, devices: 0 };
  const at = now();
  const deleted: Record<string, number> = {};
  for (const [key, when] of Object.entries(memory.deleted)) if (at - when < KEEP_REMOVALS) deleted[key] = when;

  // 1. What was removed here since the last round: it was known then and is gone now.
  let local = await localState(repos);
  let have = keysOf(local);
  for (const key of memory.known) if (!have.has(key) && !(key in deleted)) deleted[key] = at;
  for (const key of have) delete deleted[key]; // made again after it was removed

  // 2. The other computers' files.
  const own = `${memory.device}.json`;
  const remotes: DeviceState[] = [];
  for (const name of await folder.list("state")) {
    if (name === own || !name.endsWith(".json")) continue;
    const state = parseState(await folder.read(`state/${name}`));
    if (state) remotes.push(state);
  }
  summary.devices = remotes.length;

  // 3. Removals made elsewhere. They are remembered here too, so a third computer's old copy stays out.
  const byHash = new Map(local.books.map((b) => [b.hash, b]));
  const hashOf = new Map(local.books.map((b) => [b.id, b.hash]));
  const handled = new Set<string>();
  for (const remote of remotes) {
    for (const [key, when] of Object.entries(remote.deleted ?? {})) {
      if (at - when >= KEEP_REMOVALS) continue;
      if (handled.has(key)) continue; // two computers can remember the same removal
      handled.add(key);
      const [kind, ...rest] = key.split(":");
      const id = rest.join(":");
      let alive = false; // changed here after it was removed there: it stays
      if (kind === "book") {
        const book = byHash.get(id);
        if (book && book.addedAt <= when) {
          await repos.books.remove(book.id);
          byHash.delete(id);
          summary.removed++;
        } else alive = !!book;
      } else if (kind === "bookmarks") {
        const [hash, page] = [rest.slice(0, -1).join(":"), Number(rest.at(-1))];
        const mark = local.annotations.bookmarks.find((b) => hashOf.get(b.bookId) === hash && b.page === page);
        if (mark && mark.createdAt <= when) {
          await repos.annotations.remove("bookmarks", mark.id);
          summary.removed++;
        } else alive = !!mark;
      } else if (kind === "drawings") {
        const drawing = local.drawings.find((d) => d.id === id);
        if (drawing && time(drawing) <= when) {
          await repos.drawings.remove(id);
          summary.removed++;
        } else alive = !!drawing;
      } else if ((MARK_STORES as readonly string[]).includes(kind)) {
        const store = kind as (typeof MARK_STORES)[number];
        const mark = (local.annotations[store] as Stamped[]).find((r) => r.id === id);
        if (mark && time(mark) <= when) {
          await repos.annotations.remove(store, id);
          summary.removed++;
        } else alive = !!mark;
      }
      if (!alive) deleted[key] = Math.max(deleted[key] ?? 0, when);
      else handled.delete(key);
    }
  }
  if (summary.removed) local = await localState(repos);

  // 4. What the other computers have.
  const inFolder = new Set(await folder.list("books"));
  const waiting = new Set<string>();
  for (const remote of remotes) {
    const books = new Map(local.books.map((b) => [b.hash, b]));
    const ids = new Set(local.books.map((b) => b.id));
    const idMap = new Map<string, string>(); // the other computer's book id -> this one's
    const remoteHash = new Map(remote.books.map((b) => [b.id, b.hash]));
    for (const book of remote.books) {
      if ((deleted[`book:${book.hash}`] ?? -1) >= book.addedAt) continue;
      const mine = books.get(book.hash);
      if (mine) {
        idMap.set(book.id, mine.id);
        if ((book.updatedAt ?? 0) > (mine.updatedAt ?? 0)) {
          const patch: Partial<Book> = { updatedAt: book.updatedAt };
          for (const field of BOOK_FIELDS) if (field in book) (patch as Record<string, unknown>)[field] = book[field];
          await repos.books.update(mine.id, patch, { keepTime: true });
        }
        continue;
      }
      const pdf = inFolder.has(`${book.hash}.pdf`) ? await folder.read(`books/${book.hash}.pdf`) : null;
      if (!pdf) {
        waiting.add(book.hash);
        continue;
      }
      const id = ids.has(book.id) ? crypto.randomUUID() : book.id;
      const cover = remote.covers?.[book.hash] ? await folder.read(`covers/${book.hash}`) : null;
      await repos.books.add(
        { ...book, id },
        new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
        cover ? new Blob([cover as Uint8Array<ArrayBuffer>], { type: remote.covers[book.hash] }) : null,
      );
      ids.add(id);
      idMap.set(book.id, id);
      waiting.delete(book.hash);
      summary.booksAdded++;
    }

    for (const p of remote.progress ?? []) {
      const bookId = idMap.get(p.bookId);
      if (!bookId) continue;
      const mine = local.progress.find((x) => x.bookId === bookId);
      if (!mine || p.updatedAt > mine.updatedAt) await repos.progress.restore({ ...p, bookId });
    }

    for (const store of MARK_STORES) {
      const mine = new Map((local.annotations[store] as Stamped[]).map((r) => [r.id, r]));
      const fresh = ((remote.annotations?.[store] ?? []) as Stamped[]).filter((r) =>
        idMap.has(r.bookId) && (deleted[`${store}:${r.id}`] ?? -1) < time(r) && (!mine.has(r.id) || time(r) > time(mine.get(r.id)!)));
      await repos.annotations.restore(store, fresh.map((r) => ({ ...r, bookId: idMap.get(r.bookId)! })));
      summary.received += fresh.length;
    }

    const marked = new Set(local.annotations.bookmarks.map((b) => `${b.bookId}:${b.page}`));
    const bookmarks: Bookmark[] = [];
    for (const b of remote.annotations?.bookmarks ?? []) {
      const bookId = idMap.get(b.bookId);
      if (!bookId || marked.has(`${bookId}:${b.page}`)) continue;
      if ((deleted[`bookmarks:${remoteHash.get(b.bookId)}:${b.page}`] ?? -1) >= b.createdAt) continue;
      marked.add(`${bookId}:${b.page}`);
      bookmarks.push({ ...b, bookId });
    }
    await repos.annotations.restore("bookmarks", bookmarks);
    summary.received += bookmarks.length;

    const drawn = new Map(local.drawings.map((d) => [d.id, d]));
    const drawings = (remote.drawings ?? []).filter((d) =>
      idMap.has(d.bookId) && (deleted[`drawings:${d.id}`] ?? -1) < time(d) && (!drawn.has(d.id) || time(d) > time(drawn.get(d.id)!)));
    await repos.drawings.restore(drawings.map((d) => ({ ...d, bookId: idMap.get(d.bookId)! })));
    summary.received += drawings.length;

    // A review schedule: the one that was reviewed last.
    const seen = (r: ReviewState) => r.last_review ?? r.firstAt ?? 0;
    const schedules = new Map(local.reviews.map((r) => [r.id, r]));
    await repos.reviews.restore((remote.reviews ?? []).filter((r) => !schedules.has(r.id) || seen(r) > seen(schedules.get(r.id)!)));

    const sessions = new Set(local.sessions.map((x) => x.id));
    await repos.sessions.restore((remote.sessions ?? [])
      .filter((x) => !sessions.has(x.id) && idMap.has(x.bookId))
      .map((x) => ({ ...x, bookId: idMap.get(x.bookId)! })));

    local = await localState(repos);
  }
  summary.waiting = waiting.size;

  // 5. This computer's books and state, for the others.
  const covers: Record<string, string> = {};
  const coversInFolder = new Set(await folder.list("covers"));
  for (const book of local.books) {
    if (!inFolder.has(`${book.hash}.pdf`)) {
      const file = await repos.books.file(book.id);
      if (!file) continue;
      await folder.write(`books/${book.hash}.pdf`, new Uint8Array(await file.arrayBuffer()));
      summary.booksSent++;
    }
    const cover = await repos.books.cover(book.id);
    if (!cover) continue;
    covers[book.hash] = cover.type || "image/jpeg";
    if (!coversInFolder.has(book.hash)) await folder.write(`covers/${book.hash}`, new Uint8Array(await cover.arrayBuffer()));
  }
  have = keysOf(local);
  for (const key of have) delete deleted[key];
  const state: DeviceState = {
    format: FORMAT, version: VERSION, device: memory.device, savedAt: at,
    // The passwords of protected books stay on the computer.
    books: local.books.map(({ password: _, ...book }) => book),
    progress: local.progress, annotations: local.annotations, drawings: local.drawings, reviews: local.reviews, sessions: local.sessions,
    covers, deleted,
  };
  await folder.write(`state/${own}`, new TextEncoder().encode(JSON.stringify(state)));
  return { summary, known: [...have], deleted };
}

