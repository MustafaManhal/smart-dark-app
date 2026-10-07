import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { NotesPanel } from "../annotations/NotesPanel";
import { HighlightPopover, NotePopover, type NoteDraft } from "../annotations/Popovers";
import type { NoteItem } from "../annotations/noteItems";
import { clearOverlays, renderOverlays } from "../annotations/Overlays";
import { SelectionBar } from "../annotations/SelectionBar";
import { normalizeRects } from "../annotations/geometry";
import { useAnnotations } from "../annotations/useAnnotations";
import { History } from "../annotations/history";
import { ReadAloudBar } from "../readaloud/ReadAloudBar";
import { ReadingTracker } from "../stats/tracker";
import { useReadAloud } from "../readaloud/useReadAloud";
import { HIGHLIGHT_COLORS, type Bookmark, type Highlight, type HighlightColor, type NormRect, type PassageNote, type Sticky } from "../db/annotations";
import { COLOR_HEX, COLOR_LABEL } from "../annotations/colors";
import type { Book, Repos } from "../db/repos";
import { copyText, tidyCopiedText } from "../platform/clipboard";
import { navigate } from "../router";
import { adjustValues, saveSetting, settings, type DarkTheme, type ImageMode, type PageStyle, type ViewLayout } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { AdjustControls } from "./AdjustControls";
import { currentChapter } from "./chapters";
import { closePdf, flattenOutline, openPdf, PasswordError, type OutlineItem, type PDFDocumentProxy } from "./pdf";
import { printBook } from "./print";
import { PasswordSheet } from "../library/PasswordSheet";
import { saveFile } from "../platform/saveFile";
import { CSS_UNITS, Renderer } from "./renderer";
import { PageGrid } from "./PageGrid";
import { BookSearch } from "./search";
import { SearchBar, useBookSearch } from "./SearchBar";
import "./reader.css";
import "./textlayer.css";
import "../annotations/annotations.css";
import "../annotations/notes.css";
import "../library/library.css";

const STYLES: [PageStyle, string][] = [["original", "Original"], ["sepia", "Sepia"], ["dark", "Smart dark"]];
const DARK_THEMES: [DarkTheme, string][] = [["dark", "Dark"], ["dim", "Dim"], ["black", "Black"], ["warm", "Warm"], ["slate", "Slate"]];
const IMAGE_MODES: [ImageMode, string][] = [["smart", "Smart"], ["keep", "Keep"], ["dim", "Dim"], ["invert", "Darken"]];
const LAYOUTS: [ViewLayout, string][] = [["scroll", "Scrolling"], ["paged", "Page by page"], ["spread", "Two pages"]];
const canFullscreen = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;

type Anchor = { left: number; top: number; right: number; bottom: number };
type PendingSelection = { page: number; rects: NormRect[]; text: string; anchor: Anchor };
type PopState =
  | { type: "highlight"; id: string; anchor: Anchor }
  | { type: "note"; draft: NoteDraft; anchor: Anchor };

/** Screen rectangle covering page-fraction rects on a page element. */
function anchorFor(pageEl: Element, rects: NormRect[]): Anchor {
  const box = pageEl.getBoundingClientRect();
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return {
    left: box.left + left * box.width, right: box.left + right * box.width,
    top: box.top + top * box.height, bottom: box.top + bottom * box.height,
  };
}
const inRects = (rects: NormRect[], x: number, y: number) =>
  rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y - 0.004 && y <= r.y + r.h + 0.004);

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
  const [sheet, setSheet] = useState<"toc" | "appearance" | "goto" | "menu" | null>(null);
  // A protected book whose password is not stored here (for example after a backup was restored).
  const [locked, setLocked] = useState<{ wrong: boolean } | null>(null);
  const [attempt, setAttempt] = useState<{ password: string } | null>(null);
  const pdfDoc = useRef<PDFDocumentProxy | null>(null);
  const fileBlob = useRef<Blob | null>(null);
  const [printing, setPrinting] = useState<{ done: number; total: number } | null>(null);
  const printStop = useRef({ now: false });
  const [zoom, setZoom] = useState<{ scale: number; mode: "fit" | "page" | "manual" }>({ scale: 1, mode: "fit" });
  const [zoomMenu, setZoomMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [highlightMode, setHighlightMode] = useState(false);
  const [penColor, setPenColor] = useState<HighlightColor>("yellow");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [bookSearch, setBookSearch] = useState<BookSearch | null>(null);
  const annotations = useAnnotations(repos, bookId);
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [popover, setPopover] = useState<PopState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  // Undo and redo for this book's highlights, notes, sticky notes and bookmarks (Ctrl/Cmd+Z).
  const [, setHistoryVersion] = useState(0);
  const history = useRef<History | null>(null);
  history.current ??= new History(() => setHistoryVersion((v) => v + 1));
  // A new edit ends the offer to undo an earlier removal from its message.
  const record = (step: Parameters<History["push"]>[0]) => {
    setToast((current) => (current?.undo ? null : current));
    history.current!.push(step);
  };
  // Undo and redo rewrite stored notes; an open sticky note shows the stored text again when this changes.
  const [editEpoch, setEditEpoch] = useState(0);
  const undo = async () => {
    const done = await history.current!.undo();
    setEditEpoch((e) => e + 1);
    setToast({ text: t(done ? "Undone" : "Nothing to undo") });
  };
  const redo = async () => {
    const done = await history.current!.redo();
    setEditEpoch((e) => e + 1);
    setToast({ text: t(done ? "Redone" : "Nothing to redo") });
  };
  const [focusStickyId, setFocusStickyId] = useState<string | null>(null);

  useEffect(() => {
    let doc: PDFDocumentProxy | null = null;
    let cancelled = false;
    let saveTimer = 0;
    let zoomTimer = 0;
    (async () => {
      const [b, blob, saved] = await Promise.all([repos.books.get(bookId), repos.books.file(bookId), repos.progress.get(bookId)]);
      if (!b || !blob) {
        setError("This book is no longer in your library.");
        return;
      }
      setBook(b);
      repos.books.update(bookId, { lastOpenedAt: Date.now() });
      try {
        doc = await openPdf(new Uint8Array(await blob.arrayBuffer()), attempt?.password ?? b.password);
      } catch (e) {
        if (!(e instanceof PasswordError)) throw e;
        if (!cancelled) setLocked({ wrong: e.wrong && !!attempt });
        return;
      }
      if (attempt && attempt.password !== b.password) repos.books.update(bookId, { password: attempt.password });
      if (cancelled || !scroller.current) return;
      pdfDoc.current = doc;
      fileBlob.current = blob;
      const r = new Renderer(scroller.current, doc, {
        pageStyle: settings.pageStyle.value, darkTheme: settings.darkTheme.value, imageMode: settings.imageMode.value,
        adjust: adjustValues(),
      });
      renderer.current = r;
      setBookSearch(new BookSearch(doc));
      r.onPageChange = (p) => {
        setPage(p);
        setPageInput(String(p));
      };
      r.onScaleChange = (scale, mode) => {
        setZoom({ scale, mode });
        // Remember the zoom for the next book; pinch and wheel report many steps.
        clearTimeout(zoomTimer);
        zoomTimer = window.setTimeout(() => {
          if (mode !== settings.zoomMode.value) saveSetting("zoomMode", mode);
          if (mode === "manual" && scale !== settings.zoomScale.value) saveSetting("zoomScale", scale);
        }, 400);
      };
      r.onProgress = setProgress;
      r.setView({ layout: settings.viewLayout.value, cover: settings.spreadCover.value, rtl: settings.spreadRtl.value });
      await r.init({ mode: settings.zoomMode.value, scale: settings.zoomScale.value });
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
      clearTimeout(zoomTimer);
      if (renderer.current) clearOverlays(renderer.current);
      renderer.current?.destroy();
      renderer.current = null;
      setBookSearch(null);
      printStop.current.now = true;
      pdfDoc.current = null;
      fileBlob.current = null;
      closePdf(doc);
    };
  }, [bookId, attempt]);

  const print = async () => {
    if (!pdfDoc.current || printing) return;
    const stop = (printStop.current = { now: false });
    setPrinting({ done: 0, total: pdfDoc.current.numPages });
    try {
      const sent = await printBook(pdfDoc.current, (done, total) => setPrinting({ done, total }), stop);
      if (sent) setSheet(null);
    } catch {
      if (!stop.now) setToast({ text: t("This book could not be printed.") });
    }
    setPrinting(null);
  };
  const saveCopy = async () => {
    if (!fileBlob.current || !book) return;
    const saved = await saveFile(new File([fileBlob.current], book.fileName, { type: "application/pdf" }));
    if (saved) setSheet(null);
  };
  const closeMenu = () => {
    printStop.current.now = true;
    setSheet(null);
  };

  const pageStyle = settings.pageStyle.value;
  const darkTheme = settings.darkTheme.value;
  const imageMode = settings.imageMode.value;
  const adjust = adjustValues();
  useEffect(() => {
    renderer.current?.setOptions({ pageStyle, darkTheme, imageMode, adjust });
  }, [pageStyle, darkTheme, imageMode, adjust.brightness, adjust.contrast, adjust.sepia, adjust.grayscale]);

  const viewLayout = settings.viewLayout.value;
  const spreadCover = settings.spreadCover.value;
  const spreadRtl = settings.spreadRtl.value;
  useEffect(() => {
    renderer.current?.setView({ layout: viewLayout, cover: spreadCover, rtl: spreadRtl });
  }, [viewLayout, spreadCover, spreadRtl]);

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Navigation stays off until pages are laid out, so early taps are not lost.
  const total = ready ? book?.pageCount ?? 0 : 0;
  const [barsHidden, setBarsHidden] = useState(false);
  const readAloud = useReadAloud(renderer, outline, book?.pageCount ?? 0);
  const search = useBookSearch(bookSearch, renderer, page);
  const chapter = currentChapter(outline, page, total);
  const go = (p: number) => {
    if (Number.isFinite(p)) renderer.current?.scrollToPage(Math.min(total, Math.max(1, Math.round(p))));
  };

  // Reading time for goals and stats: counts only while active and visible.
  const tracker = useRef<ReadingTracker | null>(null);
  useEffect(() => {
    if (!ready || !scroller.current) return;
    const t = new ReadingTracker(repos.sessions, bookId);
    tracker.current = t;
    t.setPage(page);
    t.activity();
    const onActivity = () => t.activity();
    const onVisibility = () => t.setVisible(document.visibilityState === "visible");
    const el = scroller.current;
    el.addEventListener("scroll", onActivity, { passive: true });
    addEventListener("pointerdown", onActivity);
    addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => t.tick(), 5000);
    return () => {
      clearInterval(timer);
      t.tick();
      t.flush();
      el.removeEventListener("scroll", onActivity);
      removeEventListener("pointerdown", onActivity);
      removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      tracker.current = null;
    };
  }, [ready, bookId]);
  useEffect(() => tracker.current?.setPage(page), [page]);
  useEffect(() => tracker.current?.setPlaying(readAloud.state === "playing"), [readAloud.state]);

  // Draw highlights, sticky notes and bookmark ribbons whenever they change.
  useEffect(() => {
    if (!ready || !renderer.current) return;
    renderOverlays(renderer.current, annotations.data, {
      focusStickyId,
      epoch: editEpoch,
      onStickyChange: (s) => changeSticky(s),
      onStickyDelete: (s) => removeSticky(s),
      onNoteOpen: (n, b) => (erasing
        ? removeNote(n)
        : setPopover({ type: "note", draft: n, anchor: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } })),
    });
  }, [ready, annotations.data, focusStickyId, erasing, editEpoch]);

  // Messages leave by themselves; one with Undo stays a little longer.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? 6000 : 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  async function copy(text: string) {
    setToast({ text: t((await copyText(text)) ? "Copied" : "Could not copy") });
  }

  // Every change goes into the history. A removal also shows a message with Undo,
  // so one tap is enough to remove.
  const takeBack = async () => {
    await history.current!.undo();
    setEditEpoch((e) => e + 1);
  };
  async function removeHighlight(h: Highlight) {
    await annotations.removeHighlight(h);
    record({ undo: () => annotations.saveHighlight(h), redo: () => annotations.removeHighlight(h) });
    setToast({ text: t("Highlight removed"), undo: takeBack });
  }
  async function recolorHighlight(h: Highlight, color: HighlightColor) {
    if (color === h.color) return;
    await annotations.saveHighlight({ ...h, color });
    record({ undo: () => annotations.saveHighlight(h), redo: () => annotations.saveHighlight({ ...h, color }) });
  }
  async function saveNote(draft: Parameters<typeof annotations.saveNote>[0]) {
    const before = draft.id ? annotations.data.notes.find((n) => n.id === draft.id) : undefined;
    const saved = await annotations.saveNote(draft);
    record({
      undo: () => (before ? annotations.saveNote(before) : annotations.removeNote(saved)),
      redo: () => annotations.saveNote(saved),
    });
  }
  async function removeNote(n: PassageNote) {
    await annotations.removeNote(n);
    record({ undo: () => annotations.saveNote(n), redo: () => annotations.removeNote(n) });
    setToast({ text: t("Note removed"), undo: takeBack });
  }
  // Typing, moving, recoloring or folding a sticky note. Changes close together count as one step.
  async function changeSticky(s: Sticky) {
    const before = annotations.data.stickies.find((x) => x.id === s.id);
    const saved = await annotations.saveSticky(s);
    if (!before) return;
    record({ mergeKey: `sticky:${s.id}`, undo: () => annotations.saveSticky(before), redo: () => annotations.saveSticky(saved) });
  }
  async function removeSticky(s: Sticky) {
    // A note that comes back through undo should not grab the keyboard again.
    setFocusStickyId((id) => (id === s.id ? null : id));
    await annotations.removeSticky(s);
    record({ undo: () => annotations.saveSticky(s), redo: () => annotations.removeSticky(s) });
    setToast({ text: t("Sticky note removed"), undo: takeBack });
  }
  async function toggleBookmark(pageNumber: number) {
    await annotations.toggleBookmark(pageNumber);
    const again = () => annotations.toggleBookmark(pageNumber);
    record({ undo: again, redo: again });
  }
  async function removeBookmark(b: Bookmark) {
    await annotations.removeBookmark(b);
    const again = () => annotations.toggleBookmark(b.page);
    record({ undo: again, redo: again });
    setToast({ text: t("Bookmark removed"), undo: takeBack });
  }

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
        const text = tidyCopiedText(sel.toString());
        const b = range.getBoundingClientRect();
        const anchor = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
        setSelection(rects.length && text ? { page, rects, text, anchor } : null);
      }, 200);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onChange);
    };
  }, []);

  // The bar next to the selection follows it while the page scrolls or the window changes.
  const hasSelection = selection !== null;
  useEffect(() => {
    const el = scroller.current;
    if (!hasSelection || !el) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sel = getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) return;
        const b = sel.getRangeAt(0).getBoundingClientRect();
        setSelection((s) => s && { ...s, anchor: { left: b.left, top: b.top, right: b.right, bottom: b.bottom } });
      });
    };
    el.addEventListener("scroll", follow, { passive: true });
    addEventListener("resize", follow);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", follow);
      removeEventListener("resize", follow);
    };
  }, [hasSelection]);

  // Ctrl/Cmd + C on selected page text puts tidy text on the clipboard:
  // whole sentences, not one line of the page per line.
  const selectedText = useRef("");
  selectedText.current = selection?.text ?? "";
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (!selectedText.current || isTyping(e.target) || !e.clipboardData) return;
      e.clipboardData.setData("text/plain", selectedText.current);
      e.preventDefault();
      setToast({ text: t("Copied") });
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
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

  async function highlightSelection(color: HighlightColor) {
    if (!selection) return;
    const { page: p, rects, text } = selection;
    const saved = await annotations.saveHighlight({ bookId, page: p, rects, text, color });
    record({ undo: () => annotations.removeHighlight(saved), redo: () => annotations.saveHighlight(saved) });
    getSelection()?.removeAllRanges();
    setSelection(null);
  }

  // A note on the selected passage. Nothing is saved until the note has text.
  function noteSelection() {
    if (!selection) return;
    const { page: p, rects, text, anchor } = selection;
    setPopover({ type: "note", draft: { page: p, rects, text, body: "" }, anchor });
    getSelection()?.removeAllRanges();
    setSelection(null);
  }

  function jumpTo(entry: NoteItem) {
    const y = entry.type === "highlight" || entry.type === "note"
      ? Math.min(...entry.item.rects.map((r) => r.y))
      : entry.type === "sticky" ? entry.item.y : 0;
    renderer.current?.scrollToPage(entry.page, Math.max(0, y - 0.04));
    if (matchMedia("(max-width: 959px)").matches) setPanelOpen(false);
  }

  function removeEntry(entry: NoteItem) {
    if (entry.type === "highlight") removeHighlight(entry.item);
    else if (entry.type === "note") removeNote(entry.item);
    else if (entry.type === "sticky") removeSticky(entry.item);
    else removeBookmark(entry.item);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && placing) return setPlacing(false);
      if (e.key === "Escape" && erasing) return setErasing(false);
      // Ctrl/Cmd+Z undoes the last edit, with Shift (or Ctrl+Y) it is done again. Text fields keep their own undo.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !isTyping(e.target) && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        if (e.key.toLowerCase() === "y" || e.shiftKey) redo();
        else undo();
        return;
      }
      // Ctrl/Cmd+F searches the book instead of the browser's own find, which only sees the pages on screen.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        search.show();
        return;
      }
      // Ctrl/Cmd + plus/minus/0 zoom the pages instead of the whole app.
      if ((e.ctrlKey || e.metaKey) && ["=", "+", "-", "0"].includes(e.key)) {
        e.preventDefault();
        if (e.key === "0") renderer.current?.fitWidth();
        else renderer.current?.zoomBy(e.key === "-" ? 1 / ZOOM_STEP : ZOOM_STEP);
        return;
      }
      if (sheet || popover || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
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
  }, [page, total, sheet, popover, placing, erasing, search.open]);

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
      record({ undo: () => annotations.removeSticky(created), redo: () => annotations.saveSticky(created) });
      setFocusStickyId(created.id);
      return;
    }
    if (hit) {
      const pageEl = renderer.current!.layers(hit.page)!.page;
      const n = annotations.data.notes.find((x) => x.page === hit.page && inRects(x.rects, hit.x, hit.y));
      const h = annotations.data.highlights.find((x) => x.page === hit.page && inRects(x.rects, hit.x, hit.y));
      // Eraser: one tap removes what is under the finger (Undo brings it back).
      if (erasing) {
        if (h) removeHighlight(h);
        else if (n) removeNote(n);
        return;
      }
      if (n) return setPopover({ type: "note", draft: n, anchor: anchorFor(pageEl, n.rects) });
      if (h) return setPopover({ type: "highlight", id: h.id, anchor: anchorFor(pageEl, h.rects) });
    }
    if (matchMedia("(hover: none)").matches) setBarsHidden((hidden) => !hidden);
  };

  const bookmarked = annotations.data.bookmarks.some((b) => b.page === page);
  const bookmarkedPages = new Set(annotations.data.bookmarks.map((b) => b.page));
  const notedPages = new Set([...annotations.data.highlights, ...annotations.data.notes, ...annotations.data.stickies].map((x) => x.page));

  // Dragging along the progress line shows where it would land; letting go jumps there.
  const [scrub, setScrub] = useState<{ fraction: number; page: number } | null>(null);
  const scrubAt = (e: PointerEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const along = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    const fraction = getComputedStyle(e.currentTarget as HTMLElement).direction === "rtl" ? 1 - along : along;
    return { fraction, page: renderer.current?.pageAt(fraction) ?? 1 };
  };

  const zoomPercent = Math.round((zoom.scale / CSS_UNITS) * 100);

  const chapterStarts = total > 1 ? outline.filter((o) => o.depth === 0 && o.page > 1).map((o) => (o.page - 1) / total) : [];
  const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  return (
    <div class={`reader ${barsHidden ? "bars-hidden" : ""} ${panelOpen ? "panel-open" : ""} ${readAloud.open ? "reading" : ""} ${search.open ? "searching" : ""}`} data-style={pageStyle}>
      <header class="reader-top">
        <IconButton label={t("Back to library")} icon="back" class="top-back" onClick={() => navigate({ name: "library" })} />
        <div class="reader-title">
          <strong>{book?.title ?? ""}</strong>
          {chapter && <span>{chapter.item.title}</span>}
        </div>
        <IconButton label={t("Search in book")} icon="search" class={`top-search ${search.open ? "is-on" : ""}`}
          aria-pressed={search.open} disabled={!ready} onClick={() => (search.open ? search.close() : search.show())} />
        <IconButton label={t("Book menu")} icon="more" class="top-menu" disabled={!ready} onClick={() => setSheet("menu")} />
        <div class="tools" role="toolbar" aria-label={t("Reading tools")}>
          <IconButton label={t("Highlight text")} icon="highlighter" class={highlightMode ? "is-on" : ""}
            aria-pressed={highlightMode} disabled={!ready}
            onClick={() => { setHighlightMode((v) => !v); setPlacing(false); setErasing(false); }} />
          <IconButton label={t("Erase highlights and notes")} icon="eraser" class={erasing ? "is-on" : ""}
            aria-pressed={erasing} disabled={!ready}
            onClick={() => { setErasing((v) => !v); setHighlightMode(false); setPlacing(false); }} />
          <IconButton label={t("Add sticky note")} icon="sticky" class={placing ? "is-on" : ""}
            aria-pressed={placing} disabled={!ready}
            onClick={() => { setPlacing((v) => !v); setHighlightMode(false); setErasing(false); }} />
          <IconButton label={t(bookmarked ? "Remove bookmark" : "Bookmark this page")} icon="bookmark"
            class={bookmarked ? "is-on fill-on" : ""} aria-pressed={bookmarked} disabled={!ready}
            onClick={() => toggleBookmark(page)} />
          <IconButton label={t("Read aloud")} icon="headphones" class={readAloud.open ? "is-on" : ""} aria-pressed={readAloud.open}
            disabled={!ready} onClick={() => (readAloud.open ? readAloud.close() : (readAloud.show(), readAloud.toggle(page)))} />
          <IconButton label={t("Notes and highlights")} icon="notes" class={panelOpen ? "is-on fill-on" : ""} aria-pressed={panelOpen}
            onClick={() => setPanelOpen((v) => !v)} />
          <IconButton label={t("Contents")} icon="list" onClick={() => setSheet("toc")} disabled={!outline.length} />
          <IconButton label={t("Appearance")} icon="palette" onClick={() => setSheet("appearance")} />
        </div>
        <div class={`book-progress ${scrub ? "is-scrubbing" : ""}`} role="slider" tabIndex={ready ? 0 : -1} aria-label={t("Book progress")}
          aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}
          aria-valuetext={t("Page {page} of {total}", { page, total })}
          onPointerDown={(e) => {
            if (!ready) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            setScrub(scrubAt(e));
          }}
          onPointerMove={(e) => scrub && setScrub(scrubAt(e))}
          onPointerUp={(e) => {
            if (!scrub) return;
            renderer.current?.scrollToFraction(scrubAt(e).fraction);
            setScrub(null);
          }}
          onPointerCancel={() => setScrub(null)}
          onKeyDown={(e) => {
            const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[e.key];
            if (step === undefined) return;
            e.preventDefault();
            e.stopPropagation();
            go(page + step);
          }}>
          <span class="book-progress-fill" style={{ width: `${(scrub?.fraction ?? progress) * 100}%` }} />
          {chapterStarts.map((x) => <span class="book-progress-tick" style={{ insetInlineStart: `${x * 100}%` }} />)}
          {scrub && (
            <span class="scrub-bubble" style={{ insetInlineStart: `${scrub.fraction * 100}%` }}>
              {t("Page {page}", { page: scrub.page })}
              {(() => {
                const at = currentChapter(outline, scrub.page, total);
                return at ? <small>{at.item.title}</small> : null;
              })()}
            </span>
          )}
        </div>
      </header>

      <SearchBar search={search} />

      {highlightMode && (
        <div class="mode-hint" role="status">
          <span>{t("Select text to highlight")}</span>
          <div class="mode-colors" role="radiogroup" aria-label={t("Highlight color")}>
            {HIGHLIGHT_COLORS.map((c) => (
              <button type="button" role="radio" aria-checked={penColor === c} aria-label={t(COLOR_LABEL[c])}
                class="swatch" style={{ background: COLOR_HEX[c] }} onClick={() => setPenColor(c)} />
            ))}
          </div>
          <button type="button" class="mode-done" onClick={() => setHighlightMode(false)}>{t("Done")}</button>
        </div>
      )}

      <div class="float-tools">
        <div class="history-pill" role="group" aria-label={t("Undo and redo")}>
          <IconButton label={t("Undo")} icon="undo" disabled={!history.current.canUndo} onClick={undo} />
          <IconButton label={t("Redo")} icon="redo" disabled={!history.current.canRedo} onClick={redo} />
        </div>
        <div class="zoom-chips" role="group" aria-label={t("Quick zoom")}>
          <button type="button" class="zoom-chip" aria-pressed={zoom.mode === "fit"} disabled={!ready}
            onClick={() => renderer.current?.fitWidth()}>{t("Fit width")}</button>
          <button type="button" class="zoom-chip" aria-pressed={zoom.mode === "page"} disabled={!ready}
            onClick={() => renderer.current?.fitPage()}>{t("Fit page")}</button>
        </div>
        <button type="button" class="page-pill" disabled={!ready} onClick={() => setSheet("goto")}
          aria-label={t("Page {page} of {total}. Go to page", { page, total })}>
          <span class="page-now">{page}</span><span class="page-total">/ {total}</span>
        </button>
        <div class="zoom-pill" role="group" aria-label={t("Zoom")}>
          <IconButton label={t("Zoom out")} icon="minus" disabled={!ready} onClick={() => renderer.current?.zoomBy(1 / ZOOM_STEP)} />
          <button type="button" class="zoom-value" disabled={!ready} aria-haspopup="menu" aria-expanded={zoomMenu}
            aria-label={t("Zoom {n}%. Zoom options", { n: zoomPercent })} onClick={() => setZoomMenu((v) => !v)}>
            {zoomPercent}%
          </button>
          <IconButton label={t("Zoom in")} icon="plus" disabled={!ready} onClick={() => renderer.current?.zoomBy(ZOOM_STEP)} />
        </div>
        {zoomMenu && (
          <div class="zoom-menu" role="menu" aria-label={t("Zoom options")}>
            {ZOOM_PRESETS.map((z) => (
              <button type="button" role="menuitem" dir="ltr"
                aria-current={zoom.mode === "manual" && Math.abs(zoom.scale / CSS_UNITS - z) < 0.005 ? "true" : undefined}
                onClick={() => { renderer.current?.zoomTo(z * CSS_UNITS); setZoomMenu(false); }}>{Math.round(z * 100)}%</button>
            ))}
          </div>
        )}
      </div>

      {erasing && (
        <div class="mode-hint is-text" role="status">
          <span>{t("Tap a highlight or note to remove it")}</span>
          <button type="button" class="mode-done" onClick={() => setErasing(false)}>{t("Done")}</button>
        </div>
      )}

      {placing && (
        <div class="place-hint" role="status">
          {t("Tap the page where the note should go")}
          <button type="button" onClick={() => setPlacing(false)}>{t("Cancel")}</button>
        </div>
      )}

      {error
        ? <p class="reader-error" role="alert">{t(error)}</p>
        : <div class={`reader-scroll ${placing ? "is-placing" : ""} ${erasing ? "is-erasing" : ""}`} ref={scroller} tabIndex={0} aria-label={t("Pages")} onClick={onPageTap} />}

      <ReadAloudBar ra={readAloud} page={page} />

      {selection && !highlightMode && (
        <SelectionBar
          anchor={selection.anchor}
          onHighlight={(c) => highlightSelection(c)}
          onNote={noteSelection}
          onCopy={() => { copy(selection.text); getSelection()?.removeAllRanges(); setSelection(null); }}
        />
      )}

      {toast && (
        <div class="toast" role="status">
          {toast.text}
          {toast.undo && <button type="button" onClick={() => { toast.undo!(); setToast(null); }}>{t("Undo")}</button>}
        </div>
      )}

      {popover?.type === "highlight" && (() => {
        const h = annotations.data.highlights.find((x) => x.id === popover.id);
        return h && (
          <HighlightPopover highlight={h} anchor={popover.anchor} onClose={() => setPopover(null)}
            onColor={(c) => recolorHighlight(h, c)}
            onCopy={() => { copy(h.text); setPopover(null); }}
            onRemove={() => { removeHighlight(h); setPopover(null); }} />
        );
      })()}
      {popover?.type === "note" && (
        <NotePopover key={popover.draft.id ?? "new"} note={popover.draft} anchor={popover.anchor} onClose={() => setPopover(null)}
          onSave={(body, title) => saveNote({ bookId, ...popover.draft, body, title })}
          onDelete={() => {
            const n = annotations.data.notes.find((x) => x.id === popover.draft.id);
            if (n) removeNote(n);
            setPopover(null);
          }} />
      )}

      {panelOpen && (
        <>
          <div class="panel-backdrop" onClick={() => setPanelOpen(false)} />
          <NotesPanel title={book?.title ?? t("Notes")} data={annotations.data}
            onJump={jumpTo} onCopy={copy} onRemove={removeEntry} onClose={() => setPanelOpen(false)} />
        </>
      )}

      <Sheet open={sheet === "goto"} title={t("Go to page")} onClose={() => setSheet(null)}>
        <form class="goto" onSubmit={(e) => { e.preventDefault(); go(Number(pageInput)); setSheet(null); }}>
          <input aria-label={t("Page number")} inputMode="numeric" autoFocus={!matchMedia("(hover: none)").matches} value={pageInput}
            onFocus={(e) => e.currentTarget.select()}
            onInput={(e) => setPageInput(e.currentTarget.value)} />
          <span>{t("of {total}", { total })}</span>
          <Button variant="primary" type="submit">{t("Go")}</Button>
        </form>
        {renderer.current && sheet === "goto" && (
          <PageGrid renderer={renderer.current} total={total} current={page} bookmarked={bookmarkedPages} noted={notedPages}
            onPick={(n) => { go(n); setSheet(null); }} />
        )}
      </Sheet>

      <Sheet open={sheet === "menu"} title={t("Book menu")} onClose={closeMenu}>
        {printing ? (
          <div class="print-progress" role="status">
            <p>{t("Preparing page {n} of {total} for printing…", { n: printing.done, total: printing.total })}</p>
            <progress value={printing.done} max={printing.total} />
            <Button onClick={() => { printStop.current.now = true; }}>{t("Cancel")}</Button>
          </div>
        ) : (
          <ul class="book-menu">
            <li>
              <button type="button" onClick={print}>
                <Icon name="print" />
                <span><strong>{t("Print")}</strong><small>{t("In the book's own colors, without your highlights.")}</small></span>
              </button>
            </li>
            <li>
              <button type="button" onClick={saveCopy}>
                <Icon name="download" />
                <span><strong>{t("Save a copy")}</strong><small>{t("The PDF file as you added it.")}</small></span>
              </button>
            </li>
          </ul>
        )}
      </Sheet>

      <PasswordSheet locked={locked && book ? {
        name: book.fileName, wrong: locked.wrong,
        answer: (password) => {
          if (password === null) return navigate({ name: "library" });
          setLocked(null);
          setAttempt({ password });
        },
      } : null} />

      <Sheet open={sheet === "toc"} title={t("Contents")} onClose={() => setSheet(null)}>
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

      <Sheet open={sheet === "appearance"} title={t("Appearance")} peek onClose={() => setSheet(null)}>
        <fieldset class="seg">
          <legend>{t("Page")}</legend>
          {STYLES.map(([value, label]) => (
            <label><input type="radio" name="pageStyle" checked={pageStyle === value}
              onChange={() => saveSetting("pageStyle", value)} />{t(label)}</label>
          ))}
        </fieldset>
        {pageStyle === "dark" && (
          <>
            <fieldset class="seg">
              <legend>{t("Dark theme")}</legend>
              {DARK_THEMES.map(([value, label]) => (
                <label><input type="radio" name="darkTheme" checked={darkTheme === value}
                  onChange={() => saveSetting("darkTheme", value)} />{t(label)}</label>
              ))}
            </fieldset>
            <fieldset class="seg">
              <legend>{t("Images")}</legend>
              {IMAGE_MODES.map(([value, label]) => (
                <label><input type="radio" name="imageMode" checked={imageMode === value}
                  onChange={() => saveSetting("imageMode", value)} />{t(label)}</label>
              ))}
            </fieldset>
          </>
        )}
        <fieldset class="seg">
          <legend>{t("Layout")}</legend>
          {LAYOUTS.map(([value, label]) => (
            <label><input type="radio" name="viewLayout" checked={viewLayout === value}
              onChange={() => saveSetting("viewLayout", value)} />{t(label)}</label>
          ))}
        </fieldset>
        {viewLayout === "spread" && (
          <>
            <label class="toggle">
              <input type="checkbox" checked={spreadCover} onChange={(e) => saveSetting("spreadCover", e.currentTarget.checked)} />
              {t("First page alone, like a cover")}
            </label>
            <label class="toggle">
              <input type="checkbox" checked={spreadRtl} onChange={(e) => saveSetting("spreadRtl", e.currentTarget.checked)} />
              {t("Pages go right to left")}
            </label>
          </>
        )}
        {canFullscreen && (
          <Button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}>
            {t(fullscreen ? "Leave full screen" : "Full screen")}
          </Button>
        )}
        <AdjustControls />
      </Sheet>
    </div>
  );
}
