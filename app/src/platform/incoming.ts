import { signal } from "@preact/signals";
import type { Book, Repos } from "../db/repos";
import { makeCover } from "../library/cover";
import { importPdf } from "../library/importer";
import { navigate } from "../router";

/**
 * Files the system handed to the app that could not be opened straight away (a protected PDF, a file that
 * is not a PDF). The library takes them from here: it can ask for a password and say what went wrong.
 */
export const incoming = signal<File[]>([]);

/** Opens files that came from outside the app: "Open with" on a computer, or a double click in the desktop app. */
export async function openIncoming(repos: Repos, files: File[]) {
  let last: Book | null = null;
  const later: File[] = [];
  for (const file of files) {
    try {
      last = (await importPdf(file, { books: repos.books, makeCover })).book;
    } catch {
      later.push(file);
    }
  }
  if (later.length) {
    incoming.value = [...incoming.value, ...later];
    navigate({ name: "library" });
  } else if (last) navigate({ name: "reader", bookId: last.id });
}

type LaunchQueue = { setConsumer(consumer: (params: { files?: { getFile(): Promise<File> }[] }) => void): void };

/**
 * "Open with Reader343" for the installed web app (Chrome and Edge on computers): the manifest names PDF
 * files (`file_handlers`), and the system hands the chosen files to this queue.
 */
export function initFileLaunch(repos: Repos) {
  const queue = (globalThis as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(async (params) => {
    if (!params.files?.length) return;
    const files = await Promise.all(params.files.map((handle) => handle.getFile()));
    await openIncoming(repos, files);
  });
}
