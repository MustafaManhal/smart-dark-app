import { useEffect, useRef, useState } from "preact/hooks";
import type { Book, Repos } from "../db/repos";
import { navigate } from "../router";
import { saveSetting, settings, type DarkTheme, type ImageMode, type PageStyle } from "../settings";
import { IconButton } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { chapterProgress, currentChapter } from "./chapters";
import { closePdf, flattenOutline, openPdf, type OutlineItem, type PDFDocumentProxy } from "./pdf";
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
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let doc: PDFDocumentProxy | null = null;
    let cancelled = false;
    let saveTimer = 0;
    (async () => {
      const [b, blob, saved] = await Promise.all([repos.books.get(bookId), repos.books.file(bookId), repos.progress.get(bookId)]);
      if (!b || !blob) {
        setError("This book is no longer in your library.");
        return;
      }
      setBook(b);
      repos.books.update(bookId, { lastOpenedAt: Date.now() });
      doc = await openPdf(new Uint8Array(await blob.arrayBuffer()));
      if (cancelled || !scroller.current) return;
      const r = new Renderer(scroller.current, doc, {
        pageStyle: settings.pageStyle.value, darkTheme: settings.darkTheme.value, imageMode: settings.imageMode.value,
      });
      renderer.current = r;
      r.onPageChange = (p) => {
        setPage(p);
        setPageInput(String(p));
      };
      await r.init();
      if (saved) r.scrollToPage(saved.page, saved.offset);
      setReady(true);
      const pages = doc.numPages;
      scroller.current.addEventListener("scroll", () => {
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => {
          const pos = r.position();
          repos.progress.save(bookId, pos.page, pos.offset);
          if (pos.page === pages) repos.books.update(bookId, { finishedAt: Date.now() });
        }, 400);
      }, { passive: true });
      setOutline(await flattenOutline(doc).catch(() => []));
    })().catch(() => setError("This PDF could not be opened."));
    return () => {
      cancelled = true;
      clearTimeout(saveTimer);
      renderer.current?.destroy();
      renderer.current = null;
      closePdf(doc);
    };
  }, [bookId]);

  const pageStyle = settings.pageStyle.value;
  const darkTheme = settings.darkTheme.value;
  const imageMode = settings.imageMode.value;
  useEffect(() => {
    renderer.current?.setOptions({ pageStyle, darkTheme, imageMode });
  }, [pageStyle, darkTheme, imageMode]);

  // Navigation stays off until pages are laid out, so early taps are not lost.
  const total = ready ? book?.pageCount ?? 0 : 0;
  const chapter = currentChapter(outline, page, total);
  const chapterPct = chapterProgress(outline, page, total);
  const go = (p: number) => {
    if (Number.isFinite(p)) renderer.current?.scrollToPage(Math.min(total, Math.max(1, Math.round(p))));
  };

  return (
    <div class="reader" data-style={pageStyle}>
      <header class="reader-top">
        <IconButton label="Back to library" icon="back" onClick={() => navigate({ name: "library" })} />
        <div class="reader-title">
          <strong>{book?.title ?? ""}</strong>
          {chapter && <span>{chapter.item.title}</span>}
        </div>
        <IconButton label="Contents" icon="list" onClick={() => setSheet("toc")} disabled={!outline.length} />
        <IconButton label="Appearance" icon="palette" onClick={() => setSheet("appearance")} />
      </header>

      {error
        ? <p class="reader-error" role="alert">{error}</p>
        : <div class="reader-scroll" ref={scroller} tabIndex={0} aria-label="Pages" />}

      <footer class="reader-bottom">
        {chapterPct !== null && (
          <span class="chapter-progress" role="progressbar" aria-label="Chapter progress"
            aria-valuenow={Math.round(chapterPct * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${chapterPct * 100}%` }} />
          </span>
        )}
        <IconButton label="Previous page" icon="chevronLeft" onClick={() => go(page - 1)} disabled={page <= 1} />
        <label class="page-field">
          <input aria-label="Page number" inputMode="numeric" value={pageInput}
            onInput={(e) => setPageInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && go(Number(pageInput))}
            onBlur={() => setPageInput(String(page))} />
          <span>of {total}</span>
        </label>
        <IconButton label="Next page" icon="chevronRight" onClick={() => go(page + 1)} disabled={page >= total} />
      </footer>

      <Sheet open={sheet === "toc"} title="Contents" onClose={() => setSheet(null)}>
        <ol class="toc">
          {outline.map((item) => (
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
            <label><input type="radio" name="pageStyle" checked={pageStyle === value}
              onChange={() => saveSetting("pageStyle", value)} />{label}</label>
          ))}
        </fieldset>
        {pageStyle === "dark" && (
          <>
            <fieldset class="seg">
              <legend>Dark theme</legend>
              {DARK_THEMES.map(([value, label]) => (
                <label><input type="radio" name="darkTheme" checked={darkTheme === value}
                  onChange={() => saveSetting("darkTheme", value)} />{label}</label>
              ))}
            </fieldset>
            <fieldset class="seg">
              <legend>Images</legend>
              {IMAGE_MODES.map(([value, label]) => (
                <label><input type="radio" name="imageMode" checked={imageMode === value}
                  onChange={() => saveSetting("imageMode", value)} />{label}</label>
              ))}
            </fieldset>
          </>
        )}
      </Sheet>
    </div>
  );
}
