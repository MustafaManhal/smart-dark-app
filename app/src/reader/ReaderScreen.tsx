import { useEffect, useRef, useState } from "preact/hooks";
import { HighlightSheet } from "../annotations/HighlightSheet";
import { clearOverlays, renderOverlays } from "../annotations/Overlays";
import { SelectionBar } from "../annotations/SelectionBar";
import { normalizeRects } from "../annotations/geometry";
import { useAnnotations } from "../annotations/useAnnotations";
import { HIGHLIGHT_COLORS, type Highlight, type HighlightColor } from "../db/annotations";
import { COLOR_HEX, COLOR_LABEL } from "../annotations/colors";
import type { Book, Repos } from "../db/repos";
import { navigate } from "../router";
import { saveSetting, settings, type DarkTheme, type ImageMode, type PageStyle } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { currentChapter } from "./chapters";
import { closePdf, flattenOutline, openPdf, type OutlineItem, type PDFDocumentProxy } from "./pdf";
import { CSS_UNITS, Renderer } from "./renderer";
import "./reader.css";
import "./textlayer.css";
import "../annotations/annotations.css";

const STYLES: [PageStyle, string][] = [["original", "Original"], ["sepia", "Sepia"], ["dark", "Smart dark"]];
const DARK_THEMES: [DarkTheme, string][] = [["dark", "Dark"], ["dim", "Dim"], ["black", "Black"], ["warm", "Warm"], ["slate", "Slate"]];
const IMAGE_MODES: [ImageMode, string][] = [["smart", "Smart"], ["keep", "Keep"], ["dim", "Dim"], ["invert", "Darken"]];

type PendingSelection = { page: number; rects: Highlight["rects"]; text: string };

const ZOOM_STEP = 1.2;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

export function ReaderScreen({ repos, bookId, startPage }: { repos: Repos; bookId: string; startPage?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [sheet, setSheet] = useState<"toc" | "appearance" | "goto" | null>(null);
  const [zoom, setZoom] = useState<{ scale: number; mode: "fit" | "page" | "manual" }>({ scale: 1, mode: "fit" });
  const [zoomMenu, setZoomMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [highlightMode, setHighlightMode] = useState(false);
  const [penColor, setPenColor] = useState<HighlightColor>("yellow");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const annotations = useAnnotations(repos, bookId);
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [openHighlight, setOpenHighlight] = useState<{ h: Highlight; focusNote: boolean } | null>(null);
  const [placing, setPlacing] = useState(false);
  const [focusStickyId, setFocusStickyId] = useState<string | null>(null);

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
      r.onScaleChange = (scale, mode) => setZoom({ scale, mode });
      r.onProgress = setProgress;
      await r.init();
      if (startPage) r.scrollToPage(startPage);
      else if (saved) r.scrollToPage(saved.page, saved.offset);
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
      if (renderer.current) clearOverlays(renderer.current);
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
  const [barsHidden, setBarsHidden] = useState(false);
  const chapter = currentChapter(outline, page, total);
  const go = (p: number) => {
    if (Number.isFinite(p)) renderer.current?.scrollToPage(Math.min(total, Math.max(1, Math.round(p))));
  };

  // Draw highlights, sticky notes and bookmark ribbons whenever they change.
  useEffect(() => {
    if (!ready || !renderer.current) return;
    renderOverlays(renderer.current, annotations.data, {
      focusStickyId,
      onStickyChange: (s) => annotations.saveSticky(s),
      onStickyDelete: (s) => annotations.removeSticky(s),
    });
  }, [ready, annotations.data, focusStickyId]);

  // Watch the text selection (debounced: iOS fires this while the handles move).
  useEffect(() => {
    let timer = 0;
    const onChange = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        const sel = getSelection();
        const r = renderer.current;
        if (!sel || sel.isCollapsed || !sel.rangeCount || !r) return setSelection(null);
        const range = sel.getRangeAt(0);
        const start = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)
          ?.closest<HTMLElement>(".page");
        if (!start || !scroller.current?.contains(start)) return setSelection(null);
        const page = Number(start.dataset.page);
        // A selection that runs onto the next page is kept to its first page.
        const rects = normalizeRects([...range.getClientRects()], start.getBoundingClientRect());
        const text = sel.toString().replace(/\s+/g, " ").trim();
        setSelection(rects.length && text ? { page, rects, text } : null);
      }, 200);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, []);

  // Highlight mode: releasing the mouse or finger over a selection highlights it at
  // once. Waiting for the release stops a pause mid-drag from saving half a selection.
  const pointerDown = useRef(false);
  useEffect(() => {
    if (!highlightMode) return;
    const down = () => (pointerDown.current = true);
    const up = () => {
      pointerDown.current = false;
      setTimeout(() => document.dispatchEvent(new Event("selectionchange")), 0);
    };
    document.addEventListener("pointerdown", down);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
  }, [highlightMode]);

  useEffect(() => {
    if (highlightMode && selection && !pointerDown.current) highlightSelection(penColor);
  }, [selection, highlightMode]);

  async function highlightSelection(color: HighlightColor, withNote = false) {
    if (!selection) return;
    const saved = await annotations.saveHighlight({ bookId, ...selection, color, note: "" });
    getSelection()?.removeAllRanges();
    setSelection(null);
    if (withNote) setOpenHighlight({ h: saved, focusNote: true });
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && placing) return setPlacing(false);
      // Ctrl/Cmd + plus/minus/0 zoom the pages instead of the whole app.
      if ((e.ctrlKey || e.metaKey) && ["=", "+", "-", "0"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "0") renderer.current?.fitWidth();
        else renderer.current?.zoomBy(e.key === "-" ? 1 / ZOOM_STEP : ZOOM_STEP);
        return;
      }
      if (sheet || openHighlight || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const actions: Record<string, () => void> = {
        ArrowRight: () => go(page + 1), j: () => go(page + 1),
        ArrowLeft: () => go(page - 1), k: () => go(page - 1),
        Home: () => go(1), End: () => go(total),
      };
      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [page, total, sheet, openHighlight, placing]);

  // Page clicks: place a sticky note, open a highlight, or (touch) toggle the bars.
  const onPageTap = async (e: MouseEvent) => {
    const target = e.target as Element;
    if (target.closest("a, button, input, textarea, .sticky")) return;
    if (getSelection()?.toString()) return;
    const hit = renderer.current?.hitTest(e.clientX, e.clientY);
    if (placing) {
      setPlacing(false);
      if (!hit) return;
      const noteW = 220 / hit.box.width;
      const noteH = 150 / hit.box.height;
      const created = await annotations.saveSticky({
        bookId, page: hit.page, color: "yellow", text: "", collapsed: false,
        x: Math.min(Math.max(0, hit.x - noteW / 2), Math.max(0, 1 - noteW)),
        y: Math.min(Math.max(0, hit.y - 0.02), Math.max(0, 1 - noteH)),
      });
      setFocusStickyId(created.id);
      return;
    }
    if (hit) {
      const h = annotations.data.highlights.find((x) => x.page === hit.page && x.rects.some((r) =>
        hit.x >= r.x && hit.x <= r.x + r.w && hit.y >= r.y - 0.004 && hit.y <= r.y + r.h + 0.004));
      if (h) return setOpenHighlight({ h, focusNote: false });
    }
    if (matchMedia("(hover: none)").matches) setBarsHidden((hidden) => !hidden);
  };

  const bookmarked = annotations.data.bookmarks.some((b) => b.page === page);

  const zoomPercent = Math.round((zoom.scale / CSS_UNITS) * 100);

  const chapterStarts = total > 1 ? outline.filter((o) => o.depth === 0 && o.page > 1).map((o) => (o.page - 1) / total) : [];
  const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  return (
    <div class={`reader ${barsHidden ? "bars-hidden" : ""}`} data-style={pageStyle}>
      <header class="reader-top">
        <IconButton label="Back to library" icon="back" class="top-back" onClick={() => navigate({ name: "library" })} />
        <div class="reader-title">
          <strong>{book?.title ?? ""}</strong>
          {chapter && <span>{chapter.item.title}</span>}
        </div>
        <div class="tools" role="toolbar" aria-label="Reading tools">
          <IconButton label="Highlight text" icon="highlighter" class={highlightMode ? "is-on" : ""}
            aria-pressed={highlightMode} disabled={!ready}
            onClick={() => { setHighlightMode((v) => !v); setPlacing(false); }} />
          <IconButton label="Add sticky note" icon="sticky" class={placing ? "is-on" : ""}
            aria-pressed={placing} disabled={!ready} onClick={() => { setPlacing((v) => !v); setHighlightMode(false); }} />
          <IconButton label={bookmarked ? "Remove bookmark" : "Bookmark this page"} icon="bookmark"
            class={bookmarked ? "is-on" : ""} aria-pressed={bookmarked} disabled={!ready}
            onClick={() => annotations.toggleBookmark(page)} />
          <IconButton label="Notes and highlights" icon="notes" onClick={() => navigate({ name: "notes", bookId })} />
          <IconButton label="Contents" icon="list" onClick={() => setSheet("toc")} disabled={!outline.length} />
          <IconButton label="Appearance" icon="palette" onClick={() => setSheet("appearance")} />
        </div>
        <div class="book-progress" role="progressbar" aria-label="Book progress"
          aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span class="book-progress-fill" style={{ width: `${progress * 100}%` }} />
          {chapterStarts.map((x) => <span class="book-progress-tick" style={{ left: `${x * 100}%` }} />)}
        </div>
      </header>

      {highlightMode && (
        <div class="mode-hint" role="status">
          <span>Select text to highlight</span>
          <div class="mode-colors" role="radiogroup" aria-label="Highlight color">
            {HIGHLIGHT_COLORS.map((c) => (
              <button type="button" role="radio" aria-checked={penColor === c} aria-label={COLOR_LABEL[c]}
                class="swatch" style={{ background: COLOR_HEX[c] }} onClick={() => setPenColor(c)} />
            ))}
          </div>
          <button type="button" class="mode-done" onClick={() => setHighlightMode(false)}>Done</button>
        </div>
      )}

      <div class="float-tools">
        <button type="button" class="page-pill" disabled={!ready} onClick={() => setSheet("goto")}
          aria-label={`Page ${page} of ${total}. Go to page`}>
          <span class="page-now">{page}</span><span class="page-total">/ {total}</span>
        </button>
        <div class="zoom-pill" role="group" aria-label="Zoom">
          <IconButton label="Zoom out" icon="minus" disabled={!ready} onClick={() => renderer.current?.zoomBy(1 / ZOOM_STEP)} />
          <button type="button" class="zoom-value" disabled={!ready} aria-haspopup="menu" aria-expanded={zoomMenu}
            aria-label={`Zoom ${zoomPercent}%. Zoom options`} onClick={() => setZoomMenu((v) => !v)}>
            {zoomPercent}%
          </button>
          <IconButton label="Zoom in" icon="plus" disabled={!ready} onClick={() => renderer.current?.zoomBy(ZOOM_STEP)} />
          <span class="pill-sep" aria-hidden="true" />
          <IconButton label="Fit width" icon="fitWidth" class={zoom.mode === "fit" ? "is-on" : ""}
            aria-pressed={zoom.mode === "fit"} disabled={!ready} onClick={() => renderer.current?.fitWidth()} />
          <IconButton label="Fit page" icon="fitPage" class={zoom.mode === "page" ? "is-on" : ""}
            aria-pressed={zoom.mode === "page"} disabled={!ready} onClick={() => renderer.current?.fitPage()} />
        </div>
        {zoomMenu && (
          <div class="zoom-menu" role="menu" aria-label="Zoom options">
            <button type="button" role="menuitem" onClick={() => { renderer.current?.fitWidth(); setZoomMenu(false); }}>Fit width</button>
            <button type="button" role="menuitem" onClick={() => { renderer.current?.fitPage(); setZoomMenu(false); }}>Fit page</button>
            <hr />
            {ZOOM_PRESETS.map((z) => (
              <button type="button" role="menuitem" aria-current={Math.abs(zoom.scale / CSS_UNITS - z) < 0.005 ? "true" : undefined}
                onClick={() => { renderer.current?.zoomTo(z * CSS_UNITS); setZoomMenu(false); }}>{Math.round(z * 100)}%</button>
            ))}
          </div>
        )}
      </div>

      {placing && (
        <div class="place-hint" role="status">
          Tap the page where the note should go
          <button type="button" onClick={() => setPlacing(false)}>Cancel</button>
        </div>
      )}

      {error
        ? <p class="reader-error" role="alert">{error}</p>
        : <div class={`reader-scroll ${placing ? "is-placing" : ""}`} ref={scroller} tabIndex={0} aria-label="Pages" onClick={onPageTap} />}

      {selection && (
        <SelectionBar
          onHighlight={(c) => highlightSelection(c)}
          onNote={() => highlightSelection("yellow", true)}
          onCopy={() => { navigator.clipboard?.writeText(selection.text); getSelection()?.removeAllRanges(); setSelection(null); }}
        />
      )}

      <HighlightSheet
        highlight={openHighlight ? annotations.data.highlights.find((h) => h.id === openHighlight.h.id) ?? null : null}
        focusNote={openHighlight?.focusNote ?? false}
        onSave={(h) => annotations.saveHighlight(h)}
        onDelete={(h) => { annotations.removeHighlight(h); setOpenHighlight(null); }}
        onClose={() => setOpenHighlight(null)}
      />

      <Sheet open={sheet === "goto"} title="Go to page" onClose={() => setSheet(null)}>
        <form class="goto" onSubmit={(e) => { e.preventDefault(); go(Number(pageInput)); setSheet(null); }}>
          <input aria-label="Page number" inputMode="numeric" autoFocus value={pageInput}
            onFocus={(e) => e.currentTarget.select()}
            onInput={(e) => setPageInput(e.currentTarget.value)} />
          <span>of {total}</span>
          <Button variant="primary" type="submit">Go</Button>
        </form>
      </Sheet>

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
