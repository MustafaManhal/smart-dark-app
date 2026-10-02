import { useRef, useState } from "preact/hooks";
import type { Repos } from "../db/repos";
import { saveFile } from "../platform/saveFile";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { createBackup, restoreBackup } from "./backup";

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;

export function BackupSheet({ repos, open, onClose, onRestored }: {
  repos: Repos;
  open: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function prepare() {
    setBusy(true);
    setStatus("Preparing your backup…");
    try {
      setFile(await createBackup(repos));
      setStatus("");
    } catch {
      setStatus("The backup could not be created.");
    }
    setBusy(false);
  }

  async function restore(chosen: File) {
    setBusy(true);
    setStatus("Restoring…");
    try {
      const r = await restoreBackup(repos, new Uint8Array(await chosen.arrayBuffer()));
      const books = r.booksAdded === 1 ? "1 book" : `${r.booksAdded} books`;
      const notes = r.annotationsAdded === 1 ? "1 highlight or note" : `${r.annotationsAdded} highlights and notes`;
      setStatus(`Restored ${books} and ${notes}.${r.booksAlreadyThere ? ` ${r.booksAlreadyThere} already in your library were kept.` : ""}`);
      onRestored();
    } catch (error) {
      setStatus((error as Error).message || "The backup could not be restored.");
    }
    setBusy(false);
  }

  const close = () => {
    setFile(null);
    setStatus("");
    onClose();
  };

  return (
    <Sheet open={open} title="Back up and restore" onClose={close}>
      <div class="backup">
        <section>
          <h3>Back up</h3>
          <p>One file with every book, your reading progress, highlights, notes and settings. Keep it in Files, iCloud Drive or on your computer.</p>
          {file ? (
            // A second tap, so the iPhone share sheet gets a fresh user gesture.
            <Button variant="primary" onClick={() => saveFile(file)}><Icon name="download" size={18} /> Save backup ({mb(file.size)})</Button>
          ) : (
            <Button variant="primary" onClick={prepare} disabled={busy}>Create backup</Button>
          )}
        </section>
        <section>
          <h3>Restore</h3>
          <p>Adds the books and notes from a backup. Nothing already in your library is removed.</p>
          <Button onClick={() => input.current?.click()} disabled={busy}><Icon name="upload" size={18} /> Choose backup file</Button>
          <input ref={input} type="file" accept=".zip,application/zip" hidden
            onChange={(e) => { const f = e.currentTarget.files?.[0]; if (f) restore(f); e.currentTarget.value = ""; }} />
        </section>
        {status && <p class="backup-status" role="status">{status}</p>}
      </div>
    </Sheet>
  );
}
