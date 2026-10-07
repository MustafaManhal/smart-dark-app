import { zipSync, type Zippable } from "fflate";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Book, Repos } from "../db/repos";
import { t } from "../i18n/i18n";
import { makeCover } from "../library/cover";
import { importPdf } from "../library/importer";
import { PasswordSheet } from "../library/PasswordSheet";
import { safeFileName, saveFile } from "../platform/saveFile";
import { closePdf, openPdf, PasswordError, type PDFDocumentProxy } from "../reader/pdf";
import { navigate } from "../router";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { buildPdf, moveBefore, movePicks, pagesOf, sizeText, splitPicks, suggestName, turnPicks, type PagePick, type Source } from "./pdfTools";
import "../library/library.css";
import "./tools.css";

type Locked = { name: string; wrong: boolean; answer: (password: string | null) => void };
type Make = {
  name: string;
  which: "all" | "chosen";
  split: boolean;
  per: number;
  state: "idle" | "building" | "ready" | "failed";
  done?: number;
  files?: File[];
  /** What a tap saves: the PDF, or a zip of the parts. */
  save?: File;
  added?: "adding" | Book[];
};

const startsWith = (bytes: Uint8Array, ...head: number[]) => head.every((b, i) => bytes[i] === b);
const isPdf = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, 1024)).includes("%PDF-");

/** A picture pdf-lib cannot take as it is (WebP, GIF, HEIC…), drawn again as a JPEG. */
async function asJpeg(file: Blob): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // a see-through picture gets paper behind it
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
  if (!blob) throw new Error("picture could not be drawn");
  return new Uint8Array(await blob.arrayBuffer());
}

/** A small picture of a page. It is made when the page comes near the screen. */
function Thumb({ load, turn }: { load: () => Promise<string>; turn: number }) {
  const box = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      seen.disconnect();
      load().then((url) => live && setSrc(url)).catch(() => {});
    }, { rootMargin: "400px" });
    seen.observe(box.current!);
    return () => {
      live = false;
      seen.disconnect();
    };
  }, []);
  return (
    <span class="tool-thumb" ref={box}>
      {src && <img src={src} alt="" draggable={false} style={{ transform: `rotate(${turn}deg)` }} />}
    </span>
  );
}

/** Pages of PDFs and pictures put together into a new PDF: merge, split, reorder, turn, take out, remove. */
export function ToolsScreen({ repos, bookId }: { repos: Repos; bookId?: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [picks, setPicks] = useState<PagePick[]>([]);
  const [past, setPast] = useState<{ sources: Source[]; picks: PagePick[] }[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(!!bookId);
  const [notice, setNotice] = useState("");
  const [locked, setLocked] = useState<Locked | null>(null);
  const [library, setLibrary] = useState<Book[] | null>(null);
  const [make, setMake] = useState<Make | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTap = useRef<string | null>(null);
  // What the small pictures are made from, and the pictures already made.
  const docs = useRef(new Map<string, PDFDocumentProxy>());
  const thumbs = useRef(new Map<string, Promise<string>>());
  const line = useRef<Promise<unknown>>(Promise.resolve());
  // The newest state for work that finishes later (a file still being read when another change lands).
  const now = useRef({ sources, picks });
  now.current = { sources, picks };

  useEffect(() => () => {
    docs.current.forEach((doc) => closePdf(doc));
    thumbs.current.forEach((url) => url.then((u) => URL.revokeObjectURL(u)).catch(() => {}));
  }, []);

  const change = (next: { sources?: Source[]; picks: PagePick[] }) => {
    setPast((old) => [...old, now.current].slice(-50));
    if (next.sources) setSources(next.sources);
    setPicks(next.picks);
    now.current = { sources: next.sources ?? now.current.sources, picks: next.picks };
  };
  const undo = () => {
    const back = past.at(-1);
    if (!back) return;
    setPast(past.slice(0, -1));
    setSources(back.sources);
    setPicks(back.picks);
    setChosen(new Set([...chosen].filter((key) => back.picks.some((p) => p.key === key))));
  };

  const addSource = (source: Source) => change({ sources: [...now.current.sources, source], picks: [...now.current.picks, ...pagesOf(source)] });

  /** Opens a PDF for its page count and pictures. A protected one asks for its password until it opens or the person gives up. */
  async function addPdf(name: string, bytes: Uint8Array, password?: string): Promise<boolean> {
    for (;;) {
      try {
        const doc = await openPdf(bytes.slice(), password);
        const id = crypto.randomUUID().slice(0, 8);
        docs.current.set(id, doc);
        addSource({ id, name, kind: "pdf", bytes, password, pageCount: doc.numPages });
        return true;
      } catch (error) {
        if (!(error instanceof PasswordError)) throw error;
        const answer = await new Promise<string | null>((resolve) => setLocked({ name, wrong: error.wrong, answer: resolve }));
        setLocked(null);
        if (answer === null) return false;
        password = answer;
      }
    }
  }

  async function addFiles(files: File[]) {
    setBusy(true);
    setNotice("");
    const notes: string[] = [];
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (isPdf(bytes)) {
          if (!(await addPdf(file.name, bytes))) notes.push(t("{name} was not added: it needs its password.", { name: file.name }));
          continue;
        }
        const png = startsWith(bytes, 0x89, 0x50, 0x4e, 0x47), jpeg = startsWith(bytes, 0xff, 0xd8, 0xff);
        const data = png || jpeg ? bytes : await asJpeg(file);
        addSource({ id: crypto.randomUUID().slice(0, 8), name: file.name, kind: "image", type: png ? "image/png" : "image/jpeg", bytes: data, pageCount: 1 });
      } catch (error) {
        console.error("Could not add", file.name, error);
        notes.push(t("{name} could not be opened.", { name: file.name }));
      }
    }
    setBusy(false);
    setNotice(notes.join(" "));
  }

  async function addBook(book: Book) {
    setLibrary(null);
    setBusy(true);
    setNotice("");
    try {
      const file = await repos.books.file(book.id);
      if (!file) throw new Error("no file");
      await addPdf(book.title || book.fileName, new Uint8Array(await file.arrayBuffer()), book.password);
    } catch (error) {
      console.error("Could not add", book.fileName, error);
      setNotice(t("{name} could not be opened.", { name: book.title }));
    }
    setBusy(false);
  }

  // Opened from a book: its pages are here from the start.
  useEffect(() => {
    if (!bookId) return;
    repos.books.get(bookId).then((book) => (book ? addBook(book) : setBusy(false)));
  }, []);

  const thumbOf = (pick: PagePick) => () => {
    const key = `${pick.source}:${pick.index}`;
    let made = thumbs.current.get(key);
    if (made) return made;
    const source = sources.find((s) => s.id === pick.source)!;
    if (source.kind === "image") made = Promise.resolve(URL.createObjectURL(new Blob([source.bytes as Uint8Array<ArrayBuffer>], { type: source.type })));
    else {
      // One page at a time: a long book must not draw a hundred pages at once.
      made = line.current.then(async () => {
        const page = await docs.current.get(source.id)!.getPage(pick.index + 1);
        // The page as the file stores it: the turn is shown by the tile.
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: 260 / Math.max(base.width, base.height) });
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvas, viewport }).promise;
        page.cleanup();
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
        return URL.createObjectURL(blob!);
      });
      line.current = made.catch(() => {});
    }
    thumbs.current.set(key, made);
    return made;
  };

  const tap = (key: string, range: boolean) => {
    const next = new Set(chosen);
    const from = range && lastTap.current ? picks.findIndex((p) => p.key === lastTap.current) : -1;
    const to = picks.findIndex((p) => p.key === key);
    if (from >= 0) for (let i = Math.min(from, to); i <= Math.max(from, to); i++) next.add(picks[i].key);
    else if (next.has(key)) next.delete(key);
    else next.add(key);
    lastTap.current = key;
    setChosen(next);
  };
  const allChosen = picks.length > 0 && chosen.size === picks.length;
  const remove = () => {
    change({ picks: picks.filter((p) => !chosen.has(p.key)) });
    setChosen(new Set());
  };
  const drop = (before: string | null, dragged: string) => {
    setOver(null);
    const moving = chosen.has(dragged) ? chosen : new Set([dragged]);
    const next = moveBefore(picks, moving, before);
    if (next !== picks) change({ picks: next });
  };

  const openMake = () => setMake({ name: suggestName(sources.filter((s) => picks.some((p) => p.source === s.id))), which: chosen.size && !allChosen ? "chosen" : "all", split: false, per: 1, state: "idle" });
  const list = make?.which === "chosen" ? picks.filter((p) => chosen.has(p.key)) : picks;
  const parts = make?.split ? splitPicks(list, make.per) : [list];

  async function build() {
    if (!make || !list.length) return;
    const name = safeFileName(make.name) || "pages";
    setMake({ ...make, state: "building", done: 0 });
    try {
      const files: File[] = [];
      for (const [i, part] of parts.entries()) {
        const title = parts.length > 1 ? `${name} (${i + 1})` : name;
        const bytes = await buildPdf(sources, part, title);
        files.push(new File([bytes as Uint8Array<ArrayBuffer>], `${title}.pdf`, { type: "application/pdf" }));
        setMake((m) => m && { ...m, done: i + 1 });
      }
      // Several parts are saved as one zip. PDFs are already compressed, so the zip only stores them.
      let save = files[0];
      if (files.length > 1) {
        const entries: Zippable = {};
        for (const file of files) entries[file.name] = [new Uint8Array(await file.arrayBuffer()), { level: 0 }];
        save = new File([zipSync(entries) as Uint8Array<ArrayBuffer>], `${name}.zip`, { type: "application/zip" });
      }
      setMake((m) => m && { ...m, state: "ready", files, save });
    } catch (error) {
      console.error("Could not make the PDF", error);
      setMake((m) => m && { ...m, state: "failed" });
    }
  }

  async function addToLibrary() {
    if (!make?.files) return;
    setMake({ ...make, added: "adding" });
    const books: Book[] = [];
    for (const file of make.files) {
      try {
        books.push((await importPdf(file, { books: repos.books, makeCover })).book);
      } catch (error) {
        console.error("Could not add to the library", error);
      }
    }
    setMake((m) => m && { ...m, added: books });
  }

  const nameOf = (id: string) => sources.find((s) => s.id === id);
  const leave = () => navigate(bookId ? { name: "reader", bookId } : { name: "library" });
  const pickFiles = () => fileInput.current?.click();
  const openLibrary = () => repos.books.all().then((all) => setLibrary(all.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt))));
  const pageWord = (n: number) => (n === 1 ? t("1 page") : t("{n} pages", { n }));

  return (
    <div class="pdf-tools"
      onDragOver={(e) => { if (e.dataTransfer?.types.includes("Files")) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer?.files.length) { e.preventDefault(); addFiles([...e.dataTransfer.files]); } }}
    >
      <header class="tools-head">
        <IconButton label={t(bookId ? "Back to the book" : "Back to library")} icon="back" onClick={leave} />
        <h1>{t("PDF tools")}</h1>
        <Button variant="primary" onClick={openMake} disabled={!picks.length || busy}>{t("Make PDF")}</Button>
      </header>
      <input ref={fileInput} type="file" accept="application/pdf,.pdf,image/*" multiple hidden
        onChange={(e) => { const f = e.currentTarget.files; if (f?.length) addFiles([...f]); e.currentTarget.value = ""; }} />

      {notice && <p class="tools-notice" role="alert">{notice}</p>}

      {!sources.length && !busy && (
        <section class="lib-empty">
          <div class="lib-empty-art"><Icon name="pages" size={40} /></div>
          <h2>{t("Make a new PDF from pages")}</h2>
          <p>{t("Join PDFs, take pages out, put them in another order, turn them, or turn pictures into a PDF. Everything happens on this device.")}</p>
          <div class="tools-start">
            <Button variant="primary" onClick={pickFiles}><Icon name="plus" size={18} /> {t("Add PDFs or pictures")}</Button>
            <Button onClick={openLibrary}><Icon name="book" size={18} /> {t("Add from library")}</Button>
          </div>
        </section>
      )}
      {!sources.length && busy && <p class="tools-working" role="status">{t("Opening…")}</p>}

      {sources.length > 0 && (
        <>
          <div class="tools-add">
            <Button onClick={pickFiles} disabled={busy}><Icon name="plus" size={18} /> {t("Add PDFs or pictures")}</Button>
            <Button onClick={openLibrary} disabled={busy}><Icon name="book" size={18} /> {t("Add from library")}</Button>
            {busy && <span class="tools-working" role="status">{t("Opening…")}</span>}
          </div>
          <div class="tools-bar">
            <p class="tools-count" role="status">
              {chosen.size ? t("{n} of {total} pages chosen", { n: chosen.size, total: picks.length }) : pageWord(picks.length)}
            </p>
            <button type="button" class="chip" disabled={!picks.length} onClick={() => setChosen(allChosen ? new Set() : new Set(picks.map((p) => p.key)))}>
              {t(allChosen ? "Choose none" : "Choose all")}
            </button>
            <div class="tools-actions" role="toolbar" aria-label={t("Chosen pages")}>
              <IconButton label={t("Move earlier")} icon="chevronLeft" disabled={!chosen.size} onClick={() => change({ picks: movePicks(picks, chosen, -1) })} />
              <IconButton label={t("Move later")} icon="chevronRight" disabled={!chosen.size} onClick={() => change({ picks: movePicks(picks, chosen, 1) })} />
              <IconButton label={t("Rotate left")} icon="rotateLeft" disabled={!chosen.size} onClick={() => change({ picks: turnPicks(picks, chosen, -90) })} />
              <IconButton label={t("Rotate right")} icon="rotateRight" disabled={!chosen.size} onClick={() => change({ picks: turnPicks(picks, chosen, 90) })} />
              <IconButton label={t("Remove pages")} icon="trash" disabled={!chosen.size} onClick={remove} />
              <IconButton label={t("Undo")} icon="undo" disabled={!past.length} onClick={undo} />
            </div>
          </div>
          {picks.length === 0 && <p class="tools-hint">{t("No pages are left. Add a file, or undo.")}</p>}
          {picks.length > 0 && !chosen.size && <p class="tools-hint">{t("Tap pages to choose them, then move, turn or remove them. All pages go into the new PDF, in this order.")}</p>}
          <ul class="tools-grid"
            onDragOver={(e) => { if (e.dataTransfer?.types.includes("text/plain")) e.preventDefault(); }}
            onDrop={(e) => { const key = e.dataTransfer?.getData("text/plain"); if (key && e.target === e.currentTarget) { e.preventDefault(); drop(null, key); } }}
          >
            {picks.map((pick, i) => {
              const source = nameOf(pick.source);
              if (!source) return null;
              const from = source.kind === "pdf" ? `${source.name}, ${t("Page {page}", { page: pick.index + 1 })}` : source.name;
              return (
                <li key={pick.key} class={over === pick.key ? "is-over" : ""}>
                  <button type="button" class="tool-page" aria-pressed={chosen.has(pick.key)} draggable
                    aria-label={`${t("Page {page}", { page: i + 1 })}: ${from}`}
                    onClick={(e) => tap(pick.key, e.shiftKey)}
                    onDragStart={(e) => { e.dataTransfer?.setData("text/plain", pick.key); if (e.dataTransfer) e.dataTransfer.effectAllowed = "move"; }}
                    onDragOver={(e) => { if (e.dataTransfer?.types.includes("text/plain")) { e.preventDefault(); setOver(pick.key); } }}
                    onDragLeave={() => setOver((k) => (k === pick.key ? null : k))}
                    onDragEnd={() => setOver(null)}
                    onDrop={(e) => { const key = e.dataTransfer?.getData("text/plain"); if (key) { e.preventDefault(); e.stopPropagation(); drop(pick.key, key); } }}
                  >
                    <Thumb load={thumbOf(pick)} turn={pick.turn} />
                    <span class="tool-cap">
                      <b>{i + 1}</b>
                      <small dir="auto">{source.name}{source.kind === "pdf" && source.pageCount > 1 ? ` · ${pick.index + 1}` : ""}</small>
                    </span>
                    {chosen.has(pick.key) && <span class="tool-check"><Icon name="check" size={14} /></span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <PasswordSheet locked={locked} />

      <Sheet open={!!library} title={t("Add from library")} onClose={() => setLibrary(null)}>
        {library && (library.length === 0 ? <p class="tools-note">{t("Your library is empty.")}</p> : (
          <ul class="tools-books">
            {library.map((book) => (
              <li key={book.id}>
                <button type="button" onClick={() => addBook(book)}>
                  <Icon name="book" />
                  <span><strong dir="auto">{book.title}</strong><small>{[book.author, pageWord(book.pageCount)].filter(Boolean).join(" · ")}</small></span>
                </button>
              </li>
            ))}
          </ul>
        ))}
      </Sheet>

      <Sheet open={!!make} title={t("Make PDF")} onClose={() => make?.state !== "building" && setMake(null)}>
        {make && (make.state === "ready" && make.files && make.save ? (
          <div class="tools-ready">
            <p role="status">
              <Icon name="check" />
              <span>
                <strong dir="auto">{make.save.name}</strong>
                <small>{make.files.length > 1
                  ? t("{n} PDFs in one zip file, {size}.", { n: make.files.length, size: sizeText(make.save.size) })
                  : `${pageWord(list.length)}, ${sizeText(make.save.size)}`}</small>
              </span>
            </p>
            {Array.isArray(make.added) && (
              <p class="tools-note" role="status">{t(make.added.length ? (make.added.length === 1 ? "It is in your library now." : "They are in your library now.") : "It could not be added to the library.")}</p>
            )}
            <div class="sheet-actions">
              {Array.isArray(make.added) && make.added.length === 1
                ? <Button onClick={() => navigate({ name: "reader", bookId: (make.added as Book[])[0].id })}>{t("Open it")}</Button>
                : <Button onClick={addToLibrary} disabled={!!make.added}>{t(make.added === "adding" ? "Adding…" : "Add to library")}</Button>}
              <Button variant="primary" onClick={() => saveFile(make.save!)}><Icon name="download" size={18} /> {t("Save")}</Button>
            </div>
          </div>
        ) : (
          <form class="tools-make" onSubmit={(e) => { e.preventDefault(); build(); }}>
            <label class="field">
              <span>{t("Name")}</span>
              <input type="text" dir="auto" value={make.name} disabled={make.state === "building"} onInput={(e) => setMake({ ...make, name: e.currentTarget.value })} />
            </label>
            {chosen.size > 0 && !allChosen && (
              <fieldset class="seg" disabled={make.state === "building"}>
                <legend>{t("Pages")}</legend>
                <label><input type="radio" name="which" checked={make.which === "chosen"} onChange={() => setMake({ ...make, which: "chosen" })} />{t("Only the {n} chosen", { n: chosen.size })}</label>
                <label><input type="radio" name="which" checked={make.which === "all"} onChange={() => setMake({ ...make, which: "all" })} />{t("All {n}", { n: picks.length })}</label>
              </fieldset>
            )}
            <fieldset class="seg" disabled={make.state === "building"}>
              <legend>{t("Files")}</legend>
              <label><input type="radio" name="split" checked={!make.split} onChange={() => setMake({ ...make, split: false })} />{t("One PDF")}</label>
              <label><input type="radio" name="split" checked={make.split} onChange={() => setMake({ ...make, split: true })} />{t("Split into parts")}</label>
            </fieldset>
            {make.split && (
              <label class="field">
                <span>{t("Pages in each part")}</span>
                <input type="number" inputMode="numeric" min={1} max={Math.max(1, list.length)} value={make.per} disabled={make.state === "building"}
                  onInput={(e) => setMake({ ...make, per: Math.max(1, Math.floor(Number(e.currentTarget.value)) || 1) })} />
              </label>
            )}
            <p class="tools-note" role="status">
              {make.state === "building" ? (parts.length > 1 ? t("Making file {n} of {total}…", { n: Math.min(parts.length, (make.done ?? 0) + 1), total: parts.length }) : t("Making the PDF…"))
                : make.state === "failed" ? t("The PDF could not be made. One of the files may be damaged.")
                : parts.length > 1 ? t("{n} PDFs, saved together in one zip file.", { n: parts.length })
                : t("The files you added are not changed. Marks and notes of a book stay with that book.")}
            </p>
            <div class="sheet-actions">
              <Button onClick={() => setMake(null)} disabled={make.state === "building"}>{t("Cancel")}</Button>
              <Button variant="primary" type="submit" disabled={make.state === "building" || !list.length}>{t("Make PDF")}</Button>
            </div>
          </form>
        ))}
      </Sheet>
    </div>
  );
}
