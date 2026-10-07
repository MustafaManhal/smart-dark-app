import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { lang, t } from "../i18n/i18n";
import { NotesPanel } from "../annotations/NotesPanel";
import { HighlightPopover, NotePopover, type NoteDraft } from "../annotations/Popovers";
import type { NoteItem } from "../annotations/noteItems";
import { clearOverlays, renderOverlays } from "../annotations/Overlays";
import { SelectionBar } from "../annotations/SelectionBar";
import { fromViewPoint, fromViewRect, normalizeRects, toViewRect, type Turn } from "../annotations/geometry";
import { useAnnotations } from "../annotations/useAnnotations";
import { History } from "../annotations/history";
import { ReadAloudBar } from "../readaloud/ReadAloudBar";
import { ReadingTracker } from "../stats/tracker";
import { useReadAloud } from "../readaloud/useReadAloud";
import { HIGHLIGHT_COLORS, MARK_STYLES, type Bookmark, type Highlight, type HighlightColor, type MarkStyle, type NormRect, type PassageNote, type Sticky } from "../db/annotations";
import { COLOR_HEX, COLOR_LABEL } from "../annotations/colors";
import type { Book, Repos } from "../db/repos";
import { copyText, tidyCopiedText } from "../platform/clipboard";
import { navigate } from "../router";
import { adjustValues, saveSetting, settings, type DarkTheme, type ImageMode, type PageStyle, type ViewLayout } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { Icon, type IconName } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { AdjustControls } from "./AdjustControls";
import { currentChapter } from "./chapters";
import { closePdf, flattenOutline, openPdf, PasswordError, type OutlineItem, type PDFDocumentProxy, type Target } from "./pdf";
import { LinkPreview } from "./LinkPreview";
import { measureCrop } from "./crop";
import { AutoScrollBar, useAutoScroll } from "./autoscroll";
import { CommandPalette, type Command } from "./CommandPalette";
import { keys, ShortcutSheet } from "./ShortcutSheet";
import { Tour } from "./Tour";
import { wordToLookUp } from "../lookup/dictionary";
import { LookupSheet } from "../lookup/LookupSheet";
import { makeOutline } from "./autoOutline";
import { render } from "preact";
import { DRAW_COLORS, DRAW_TOOLS, type Drawing, type DrawTool } from "../db/drawings";
import { DrawLayer } from "../draw/DrawLayer";
import { DRAW_HEX, DRAW_LABEL, DRAW_SIZES, placeSignature, thin, worthKeeping } from "../draw/shapes";
import { SignaturePad } from "../draw/SignaturePad";
import "../draw/draw.css";
import { recognizeBook, type OcrLang } from "../ocr/ocr";
import type { OcrPage } from "../ocr/text";
import { SidePanel, type PanelSection } from "./SidePanel";
import { pageColors, Swatch, themeColors } from "./Swatch";
import { useMedia } from "../ui/useMedia";
import { QuoteSheet } from "../annotations/QuoteSheet";
import type { QuoteSource } from "../annotations/quote";
import { printBook } from "./print";
import { PasswordSheet } from "../library/PasswordSheet";
import { safeFileName, saveFile } from "../platform/saveFile";
import { exportAnnotatedPdf, exportCount } from "../annotations/exportPdf";
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
function anchorFor(pageEl: Element, marked: NormRect[], turn: Turn): Anchor {
  const box = pageEl.getBoundingClientRect();
  const rects = marked.map((r) => toViewRect(r, turn));
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
const DRAW_TOOL_LABEL: Record<DrawTool, string> = { pen: "Pen", line: "Line", arrow: "Arrow", rect: "Box", ellipse: "Oval", text: "Text box", sign: "Signature" };
const DRAW_TOOL_ICON: Record<DrawTool, IconName> = { pen: "draw", line: "line", arrow: "arrowLine", rect: "square", ellipse: "circle", text: "textBox", sign: "signature" };
const OCR_LANGS: [OcrLang, string][] = [["eng", "English"], ["ara", "Arabic"], ["eng+ara", "English and Arabic"]];
const MODE_TEXT: Record<MarkStyle, string> = { highlight: "Select text to highlight", underline: "Select text to underline", strike: "Select text to strike through" };
const MODE_STYLE: Record<MarkStyle, string> = { highlight: "Highlight", underline: "Underline", strike: "Strikethrough" };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable);

export function ReaderScreen({ repos, bookId, startPage, startFind, tour }: {
  repos: Repos; bookId: string; startPage?: number; startFind?: string; tour?: boolean;
}) {
  const [touring, setTouring] = useState(!!tour);
  const scroller = useRef<HTMLDivElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [sheet, setSheet] = useState<"appearance" | "goto" | "menu" | "shortcuts" | "ocr" | null>(null);
  const [palette, setPalette] = useState(false);
  const [quote, setQuote] = useState<{ text: string; source: QuoteSource } | null>(null);
  // A protected book whose password is not stored here (for example after a backup was restored).
  const [locked, setLocked] = useState<{ wrong: boolean } | null>(null);
  const [attempt, setAttempt] = useState<{ password: string } | null>(null);
  const pdfDoc = useRef<PDFDocumentProxy | null>(null);
  const fileBlob = useRef<Blob | null>(null);
  const [printing, setPrinting] = useState<{ done: number; total: number } | null>(null);
  // A PDF form in this book, and whether something was filled into it.
  const [hasForm, setHasForm] = useState(false);
  // The contents were made from the book's headings (the PDF had none of its own).
  const [madeOutline, setMadeOutline] = useState(false);
  const [formFilled, setFormFilled] = useState(false);
  // Text recognition for scanned pages (OCR): what was recognized, and the run that is going on.
  const ocrPages = useRef(new Map<number, OcrPage>());
  const [ocrLang, setOcrLang] = useState<OcrLang>(lang.value === "ar" ? "eng+ara" : "eng");
  const [ocr, setOcr] = useState<{ state: "running"; page: number; total: number; found: number; loading: boolean } | { state: "done"; found: number } | { state: "failed" } | null>(null);
  const ocrStop = useRef({ now: false });
  const recognize = async () => {
    const doc = pdfDoc.current;
    if (!doc || ocr?.state === "running") return;
    const stop = (ocrStop.current = { now: false });
    setOcr({ state: "running", page: 0, total: doc.numPages, found: 0, loading: true });
    try {
      const found = await recognizeBook(doc, bookId, ocrLang, new Set(ocrPages.current.keys()), async (recognized) => {
        await repos.ocr.put(recognized);
        ocrPages.current.set(recognized.page, recognized);
        bookSearch?.forget(recognized.page);
        await renderer.current?.refreshText(recognized.page);
      }, (state) => !stop.now && setOcr({ state: "running", ...state }), stop);
      if (!stop.now) setOcr({ state: "done", found });
    } catch (error) {
      console.error("OCR failed", error);
      if (!stop.now) setOcr({ state: "failed" });
    }
  };
  // Crop margins belongs to the book: its margins are measured once and kept with it.
  const [crop, setCrop] = useState<Book["crop"]>(undefined);
  const [measuring, setMeasuring] = useState<number | null>(null);
  // The book can be turned by quarter turns (a scan that lies on its side). Kept with the book.
  const [turn, setTurn] = useState<Turn>(0);
  const rotate = (by: 90 | -90) => {
    const next = ((turn + by + 360) % 360) as Turn;
    setTurn(next);
    renderer.current?.setTurn(next);
    repos.books.update(bookId, { rotation: next });
  };
  const cropStop = useRef({ now: false });
  const printStop = useRef({ now: false });
  const [zoom, setZoom] = useState<{ scale: number; mode: "fit" | "page" | "manual" }>({ scale: 1, mode: "fit" });
  const [zoomMenu, setZoomMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [highlightMode, setHighlightMode] = useState(false);
  // With the highlighter on: mark a rectangle of the page instead of words (for scans and figures).
  const [areaMode, setAreaMode] = useState(false);
  const dragEnded = useRef({ at: -1000, x: 0, y: 0 });
  const [penColor, setPenColor] = useState<HighlightColor>("yellow");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [bookSearch, setBookSearch] = useState<BookSearch | null>(null);
  const annotations = useAnnotations(repos, bookId);
  const [selection, setSelection] = useState<PendingSelection | null>(null);
  const [popover, setPopover] = useState<PopState | null>(null);
  // The side panel: contents, pages and notes of the book. A tool opens it at its part, and closes it again.
  const [panel, setPanel] = useState<PanelSection | null>(null);
  const panelOpen = panel !== null;
  const setPanelOpen = (open: boolean) => setPanel(open ? "notes" : null);
  const togglePanel = (section: PanelSection) => setPanel((now) => (now === section ? null : section));
  // On a phone the panel covers the page, so going somewhere from it puts it away.
  const leavePanel = () => { if (matchMedia("(max-width: 959px)").matches) setPanel(null); };
  const [placing, setPlacing] = useState(false);
  const [erasing, setErasing] = useState(false);
  // Drawing on the page: pen strokes, lines, arrows, boxes, ovals and text boxes.
  const [drawMode, setDrawMode] = useState(false);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [live, setLive] = useState<Drawing | null>(null);
  const [editingText, setEditingText] = useState<Drawing | null>(null);
  const [signing, setSigning] = useState(false);
  const [lookupWord, setLookupWord] = useState<string | null>(null);
  const drawTool = settings.drawTool.value;
  const drawColor = settings.drawColor.value;
  const drawSize = settings.drawSize.value;
  const saveDrawing = async (d: Parameters<Repos["drawings"]["put"]>[0]) => {
    const saved = await repos.drawings.put(d);
    setDrawings((list) => [...list.filter((x) => x.id !== saved.id), saved]);
    return saved;
  };
  const removeDrawing = async (d: Drawing) => {
    await repos.drawings.remove(d.id);
    setDrawings((list) => list.filter((x) => x.id !== d.id));
  };
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
    let formTimer = 0;
    const outlineStop = { now: false };
    setMadeOutline(false);
    (async () => {
      const [b, blob, saved] = await Promise.all([repos.books.get(bookId), repos.books.file(bookId), repos.progress.get(bookId)]);
      if (!b || !blob) {
        setError("This book is no longer in your library.");
        return;
      }
      setBook(b);
      setCrop(b.crop);
      setTurn(b.rotation ?? 0);
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
      r.linkLabel = (n) => t("Link to page {n}", { n });
      // Text recognized on scanned pages before (OCR) is their text from the start.
      ocrPages.current = new Map((await repos.ocr.forBook(bookId)).map((p) => [p.page, p]));
      setDrawings(await repos.drawings.forBook(bookId));
      r.recognized = (n) => ocrPages.current.get(n);
      setBookSearch(new BookSearch(doc, r.recognized));
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
      // A PDF form: its fields become inputs, and what was filled in before is put back.
      const fields = await doc.getFieldObjects().catch(() => null) as Map<string, unknown> | Record<string, unknown> | null;
      r.forms = !!fields;
      setHasForm(r.forms);
      for (const [key, value] of Object.entries(b.formValues ?? {})) doc.annotationStorage.setValue(key, value as never);
      setFormFilled(Object.keys(b.formValues ?? {}).length > 0);
      r.onFormChange = () => {
        setFormFilled(true);
        clearTimeout(formTimer);
        formTimer = window.setTimeout(() => repos.books.update(bookId, { formValues: Object.fromEntries([...doc!.annotationStorage]) as Record<string, unknown> }), 500);
      };
      r.setView({ layout: settings.viewLayout.value, cover: settings.spreadCover.value, rtl: settings.spreadRtl.value });
      if (b.crop?.on) r.setCrop(b.crop.box);
      if (b.rotation) r.setTurn(b.rotation);
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
      const own = await flattenOutline(doc).catch(() => []);
      setOutline(own);
      if (!own.length) {
        // The PDF has no contents inside: make them from its headings, once, and keep them with the book.
        const made = b.madeOutline ?? await makeOutline(doc, outlineStop);
        if (made && !cancelled) {
          setOutline(made);
          setMadeOutline(made.length > 0);
          if (!b.madeOutline) repos.books.update(bookId, { madeOutline: made });
        }
      }
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
      outlineStop.now = true;
      ocrStop.current.now = true;
      cropStop.current.now = true;
      setMeasuring(null);
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
  const toggleCrop = async (on: boolean) => {
    const r = renderer.current;
    const doc = pdfDoc.current;
    if (!r || !doc) return;
    let box = crop?.box ?? null;
    if (on && !crop) {
      const stop = (cropStop.current = { now: false });
      setMeasuring(0);
      box = await measureCrop(doc, (done, total) => setMeasuring(Math.round((done / total) * 100)), stop);
      if (stop.now) return;
      setMeasuring(null);
    }
    const next = { on: on && !!box, box };
    setCrop(next);
    repos.books.update(bookId, { crop: next });
    r.setCrop(next.on ? box : null);
    // The point is larger text: a zoom set by hand goes back to the width of the screen.
    if (next.on && r.zoomMode === "manual") r.fitWidth();
  };
  const saveCopy = async () => {
    if (!fileBlob.current || !book) return;
    const saved = await saveFile(new File([fileBlob.current], book.fileName, { type: "application/pdf" }));
    if (saved) setSheet(null);
  };
  // The PDF with the reader's marks inside it. It is built first and saved with a second tap, because a
  // phone only lets a file be saved from inside a tap (see saveFile).
  const [marked, setMarked] = useState<{ state: "building" } | { state: "ready"; file: File } | { state: "failed" } | null>(null);
  const buildMarked = async () => {
    if (!fileBlob.current || !book) return;
    setMarked({ state: "building" });
    try {
      // A filled form is written by pdf.js first; the marks then go into that copy.
      const filled = formFilled && pdfDoc.current ? await pdfDoc.current.saveDocument().catch(() => null) : null;
      const source = filled ?? new Uint8Array(await fileBlob.current.arrayBuffer());
      const bytes = await exportAnnotatedPdf(source, annotations.data, filled ? undefined : book.password, drawings);
      const name = `${safeFileName(book.fileName.replace(/\.pdf$/i, ""))} (${t("with marks")}).pdf`;
      setMarked({ state: "ready", file: new File([bytes as Uint8Array<ArrayBuffer>], name, { type: "application/pdf" }) });
    } catch (error) {
      console.error("Export failed", error);
      setMarked({ state: "failed" });
    }
  };
  const closeMenu = () => {
    printStop.current.now = true;
    setMarked(null);
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
  const narrow = useMedia("(max-width: 720px)");
  const readAloud = useReadAloud(renderer, outline, book?.pageCount ?? 0);
  const search = useBookSearch(bookSearch, renderer, page);
  // Opened from a search across the library: the same words are looked for in this book, from the page given.
  useEffect(() => {
    if (!ready || !startFind) return;
    search.setQuery(startFind);
    search.show();
  }, [ready]);
  // Auto-scroll and read aloud both move the page, so only one runs at a time.
  const auto = useAutoScroll(scroller);
  const startAuto = () => { readAloud.close(); setSheet(null); auto.start(); };
  const startReadAloud = () => { auto.stop(); readAloud.show(); readAloud.toggle(page); };
  const chapter = currentChapter(outline, page, total);
  const go = (p: number) => {
    if (Number.isFinite(p)) renderer.current?.scrollToPage(Math.min(total, Math.max(1, Math.round(p))));
  };
  // A jump (a link, the contents, a page number, a note) remembers where it started, so Back returns there.
  const [backStack, setBackStack] = useState<{ page: number; offset: number }[]>([]);
  const jump = (p: number, offset = 0) => {
    const r = renderer.current;
    if (!r || !Number.isFinite(p)) return;
    const to = Math.min(total, Math.max(1, Math.round(p)));
    const from = r.position();
    if (to !== from.page || Math.abs(offset - from.offset) > 0.25) setBackStack((stack) => [...stack.slice(-19), from]);
    r.scrollToPage(to, offset);
  };
  const goBack = () => {
    const last = backStack.at(-1);
    if (!last) return;
    setBackStack((stack) => stack.slice(0, -1));
    renderer.current?.scrollToPage(last.page, last.offset);
  };
  useEffect(() => setBackStack([]), [bookId]);

  // Links into the book: a tap follows one; resting the mouse on one, or a long press, shows where it leads.
  const [preview, setPreview] = useState<{ target: Target; anchor: DOMRect; touch: boolean } | null>(null);
  const linkTimer = useRef(0);
  const closeTimer = useRef(0);
  const longPressed = useRef(false);
  const pressAt = useRef({ x: 0, y: 0 });
  const insideLink = (e: Event) => (e.target as Element).closest?.(".pdf-link.is-inside") ?? null;
  const followLink = async (link: Element) => {
    clearTimeout(linkTimer.current);
    setPreview(null);
    const target = await renderer.current?.linkTarget(link);
    if (target) jump(target.page, placeOf(target));
  };
  // Where on its page a link target is, as a scroll offset. A turned page is shown from its top.
  const placeOf = (target: Target) => {
    const top = target.top ? renderer.current?.offsetFor(target.top) ?? 0 : 0;
    return top ? Math.max(0, top - 0.03) : 0;
  };
  const showPreview = (link: Element, touch: boolean, delay: number) => {
    clearTimeout(linkTimer.current);
    clearTimeout(closeTimer.current);
    linkTimer.current = window.setTimeout(async () => {
      const target = await renderer.current?.linkTarget(link);
      if (!target || !link.isConnected) return;
      longPressed.current = touch;
      setPreview({ target, anchor: link.getBoundingClientRect(), touch });
    }, delay);
  };
  const linkPointer = {
    onPointerOver: (e: PointerEvent) => {
      const link = e.pointerType === "mouse" && insideLink(e);
      if (link) showPreview(link, false, 350);
    },
    onPointerOut: (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || !insideLink(e)) return;
      clearTimeout(linkTimer.current);
      closeTimer.current = window.setTimeout(() => setPreview((p) => (p?.touch ? p : null)), 200);
    },
    onPointerDown: (e: PointerEvent) => {
      longPressed.current = false;
      pressAt.current = { x: e.clientX, y: e.clientY };
      const link = e.pointerType !== "mouse" && insideLink(e);
      if (link) showPreview(link, true, 450);
    },
    onPointerMove: (e: PointerEvent) => {
      // A finger that moves is scrolling, not pressing.
      if (e.pointerType !== "mouse" && Math.hypot(e.clientX - pressAt.current.x, e.clientY - pressAt.current.y) > 10) clearTimeout(linkTimer.current);
    },
    onPointerUp: (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && !longPressed.current) clearTimeout(linkTimer.current);
    },
    onPointerCancel: () => clearTimeout(linkTimer.current),
  };
  // The look at a link's target belongs to where the link is on screen: scrolling or Escape puts it away.
  useEffect(() => {
    if (!preview) return;
    const close = () => setPreview(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    scroller.current?.addEventListener("scroll", close, { passive: true });
    addEventListener("keydown", onKey);
    return () => {
      scroller.current?.removeEventListener("scroll", close);
      removeEventListener("keydown", onKey);
    };
  }, [preview]);
  useEffect(() => () => { clearTimeout(linkTimer.current); clearTimeout(closeTimer.current); }, []);

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
  }, [ready, annotations.data, focusStickyId, erasing, editEpoch, turn]);

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
  async function restyleHighlight(h: Highlight, style: MarkStyle) {
    if (style === (h.style ?? "highlight")) return;
    await annotations.saveHighlight({ ...h, style });
    record({ undo: () => annotations.saveHighlight(h), redo: () => annotations.saveHighlight({ ...h, style }) });
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
        // Marks are kept on the page as the PDF has it, whatever way the book is turned on screen.
        const rects = normalizeRects([...range.getClientRects()], start.getBoundingClientRect()).map((rect) => fromViewRect(rect, r.turnValue));
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
    if (highlightMode && selection && !pointerDown.current) highlightSelection(penColor, settings.markStyle.value);
  }, [selection, highlightMode]);

  // Draw what is drawn: every page's saved drawings, plus the stroke or text box in the making on its page.
  useEffect(() => {
    const r = renderer.current;
    if (!ready || !r) return;
    const byPage = new Map<number, Drawing[]>();
    for (const d of drawings) byPage.set(d.page, [...(byPage.get(d.page) ?? []), d]);
    const making = live ?? (editingText?.id === "new" ? editingText : null);
    for (let n = 1; n <= r.pageCount; n++) {
      const layers = r.layers(n);
      if (!layers) continue;
      const mine = byPage.get(n) ?? [];
      if (!mine.length && making?.page !== n && !layers.drawings.firstChild) continue;
      render(<DrawLayer drawings={mine} live={making?.page === n ? making : null} w={layers.w} h={layers.h}
        editing={editingText?.page === n ? editingText.id : null} onText={finishText} />, layers.drawings);
    }
  }, [ready, drawings, live, editingText]);
  useEffect(() => () => {
    const r = renderer.current;
    if (r) for (let n = 1; n <= r.pageCount; n++) render(null, r.layers(n)!.drawings);
  }, [bookId]);

  // A text box that was being written is done: keep it, change it, or drop it when it is empty.
  const finishText = async (box: Drawing, text: string) => {
    setEditingText(null);
    if (box.id === "new") {
      if (!text) return;
      const { id: _, createdAt: __, updatedAt: ___, ...fresh } = box;
      const saved = await saveDrawing({ ...fresh, text });
      record({ undo: () => removeDrawing(saved), redo: () => saveDrawing(saved) });
    } else if (!text) {
      await removeDrawing(box);
      record({ undo: () => saveDrawing(box), redo: () => removeDrawing(box) });
    } else if (text !== box.text) {
      const saved = await saveDrawing({ ...box, text });
      record({ undo: () => saveDrawing(box), redo: () => saveDrawing(saved) });
    }
  };

  // The drawing tool: a drag on a page makes a stroke or a shape. (A text box is made by a tap, in onPageTap.)
  useLayoutEffect(() => {
    const el = scroller.current;
    const r = renderer.current;
    if (!el || !r || !drawMode || drawTool === "text" || drawTool === "sign") return;
    let stroke: { pageEl: HTMLElement; drawing: Drawing; id: number } | null = null;
    const place = (e: PointerEvent, pageEl: HTMLElement): [number, number] => {
      const box = pageEl.getBoundingClientRect();
      const within = (v: number) => Math.min(1, Math.max(0, v));
      return fromViewPoint(within((e.clientX - box.left) / box.width), within((e.clientY - box.top) / box.height), r.turnValue);
    };
    const down = (e: PointerEvent) => {
      // A second finger means a pinch: the stroke that began is dropped.
      if (!e.isPrimary) return cancel();
      if (e.button !== 0 || (e.target as Element).closest(".sticky, .pn-badge, button, a, .draw-text")) return;
      const pageEl = (e.target as Element).closest<HTMLElement>(".page");
      if (!pageEl) return;
      e.preventDefault();
      const [x, y] = place(e, pageEl);
      const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
      const drawing: Drawing = {
        id: "live", bookId, page: Number(pageEl.dataset.page), tool: drawTool, color: drawColor, size: drawSize,
        points: drawTool === "pen" ? [x, y, pressure] : [x, y, x, y], createdAt: 0, updatedAt: 0,
      };
      stroke = { pageEl, drawing, id: e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch {}
      setLive(drawing);
    };
    const move = (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.id) return;
      const d = stroke.drawing;
      // A pen reports more often than the screen draws: take every point it gives.
      const events = d.tool === "pen" && e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e];
      let points = d.points;
      for (const ev of events) {
        const [x, y] = place(ev, stroke.pageEl);
        points = d.tool === "pen" ? [...points, x, y, ev.pointerType === "pen" ? ev.pressure || 0.5 : 0.5] : [points[0], points[1], x, y];
      }
      stroke.drawing = { ...d, points };
      setLive(stroke.drawing);
    };
    const up = async (e: PointerEvent) => {
      if (!stroke || e.pointerId !== stroke.id) return;
      const { id: _, createdAt: __, updatedAt: ___, ...made } = stroke.drawing;
      stroke = null;
      setLive(null);
      dragEnded.current = { at: e.timeStamp, x: e.clientX, y: e.clientY }; // the click that follows is the end of this stroke, not a tap
      const drawing = made.tool === "pen" ? { ...made, points: thin(made.points) } : made;
      if (!worthKeeping(drawing)) return;
      const saved = await saveDrawing(drawing);
      record({ undo: () => removeDrawing(saved), redo: () => saveDrawing(saved) });
    };
    function cancel() {
      stroke = null;
      setLive(null);
    }
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      cancel();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [drawMode, drawTool, drawColor, drawSize, ready]);

  // Area marks: with the highlighter in area mode, a drag on a page draws a rectangle that becomes a mark.
  // A layout effect: the page takes the drag from the moment the mode shows as on.
  useLayoutEffect(() => {
    const el = scroller.current;
    const r = renderer.current;
    if (!el || !r || !highlightMode || !areaMode) return;
    let drag: { pageEl: HTMLElement; x: number; y: number; ghost: HTMLElement } | null = null;
    const boxOf = (e: PointerEvent) => {
      const page = drag!.pageEl.getBoundingClientRect();
      const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
      const x1 = within(Math.min(drag!.x, e.clientX), page.left, page.right);
      const x2 = within(Math.max(drag!.x, e.clientX), page.left, page.right);
      const y1 = within(Math.min(drag!.y, e.clientY), page.top, page.bottom);
      const y2 = within(Math.max(drag!.y, e.clientY), page.top, page.bottom);
      return { page, left: x1 - page.left, top: y1 - page.top, width: x2 - x1, height: y2 - y1 };
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || !e.isPrimary || (e.target as Element).closest(".sticky, .pn-badge, button, a")) return;
      const pageEl = (e.target as Element).closest<HTMLElement>(".page");
      if (!pageEl) return;
      e.preventDefault();
      const ghost = document.createElement("div");
      ghost.className = "area-ghost";
      ghost.style.setProperty("--hl", COLOR_HEX[penColor]);
      pageEl.append(ghost);
      drag = { pageEl, x: e.clientX, y: e.clientY, ghost };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const b = boxOf(e);
      Object.assign(drag.ghost.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
    };
    const up = async (e: PointerEvent) => {
      if (!drag) return;
      const b = boxOf(e);
      const pageNumber = Number(drag.pageEl.dataset.page);
      drag.ghost.remove();
      drag = null;
      if (b.width < 8 || b.height < 8) return; // a tap, not a drag
      dragEnded.current = { at: e.timeStamp, x: e.clientX, y: e.clientY };
      const round = (v: number) => Math.round(v * 1e5) / 1e5;
      const shown = { x: round(b.left / b.page.width), y: round(b.top / b.page.height), w: round(b.width / b.page.width), h: round(b.height / b.page.height) };
      // An area has no words; it is kept like every mark, on the page as the PDF has it.
      const saved = await annotations.saveHighlight({ bookId, page: pageNumber, rects: [fromViewRect(shown, r.turnValue)], text: "", color: penColor });
      record({ undo: () => annotations.removeHighlight(saved), redo: () => annotations.saveHighlight(saved) });
    };
    const cancel = () => {
      drag?.ghost.remove();
      drag = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    return () => {
      cancel();
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
    };
  }, [highlightMode, areaMode, penColor, ready]);

  // The bar at a selection always highlights. The highlighter tool draws in its own style (see the tool's hint).
  async function highlightSelection(color: HighlightColor, style: MarkStyle = "highlight") {
    if (!selection) return;
    const { page: p, rects, text } = selection;
    const saved = await annotations.saveHighlight({ bookId, page: p, rects, text, color, ...(style === "highlight" ? {} : { style }) });
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
    jump(entry.page, Math.max(0, (renderer.current?.offsetFor(y) ?? y) - 0.04));
    leavePanel();
  }

  function removeEntry(entry: NoteItem) {
    if (entry.type === "highlight") removeHighlight(entry.item);
    else if (entry.type === "note") removeNote(entry.item);
    else if (entry.type === "sticky") removeSticky(entry.item);
    else removeBookmark(entry.item);
  }

  // The keys always run the handler of the latest render. An effect that swaps the listener would lag a
  // moment behind each change (effects run after the paint), long enough for a quick second key press.
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e: KeyboardEvent) => {
    if (e.key === "Escape" && placing) return setPlacing(false);
    if (e.key === "Escape" && erasing) return setErasing(false);
    if (e.key === "Escape" && drawMode) return setDrawMode(false);
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
    // Ctrl/Cmd+K: every action in one list.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
      e.preventDefault();
      setPalette((on) => !on);
      return;
    }
    // Alt+Left returns from the last jump, as Back does in a browser.
    if (e.altKey && e.key === "ArrowLeft" && backStack.length && !isTyping(e.target)) {
      e.preventDefault();
      goBack();
      return;
    }
    if (sheet || popover || palette || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === " " && auto.open) {
      e.preventDefault(); // Space would page down under the moving text
      auto.toggle();
      return;
    }
    const actions: Record<string, () => void> = {
      "?": () => setSheet("shortcuts"),
      a: () => (auto.open ? auto.stop() : startAuto()), A: () => (auto.open ? auto.stop() : startAuto()),
      b: () => toggleBookmark(page), B: () => toggleBookmark(page),
      g: () => setSheet("goto"), G: () => setSheet("goto"),
      r: () => rotate(90), R: () => rotate(e.shiftKey ? -90 : 90),
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
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e);
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, []);

  // Page clicks: place a sticky note, open a highlight, or (touch) toggle the bars.
  const onPageTap = async (e: MouseEvent) => {
    const target = e.target as Element;
    // The click that ends a drag (drawing an area or a stroke) is not a tap: it comes at once, where the drag ended.
    const drag = dragEnded.current;
    if (e.timeStamp - drag.at < 80 && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
    const link = target.closest(".pdf-link.is-inside");
    if (link) {
      // The tap that ends a long press only leaves the preview on screen.
      if (longPressed.current) longPressed.current = false;
      else followLink(link);
      return;
    }
    if (preview) setPreview(null);
    if (target.closest("a, button, input, textarea, .sticky")) return;
    if (drawMode) {
      // With the signature tool a tap puts the signature there, upright as the page is shown.
      if (drawTool === "sign") {
        const at = renderer.current?.hitTest(e.clientX, e.clientY);
        const signature = settings.signature.value;
        if (!at) return;
        if (!signature.length) return setSigning(true);
        const turn = renderer.current!.turnValue;
        const points = placeSignature(signature, at.vx, at.vy, 0.3, at.box.width / at.box.height, (x, y) => fromViewPoint(Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y)), turn));
        const saved = await saveDrawing({ bookId, page: at.page, tool: "sign", color: drawColor, size: 0.003, points });
        record({ undo: () => removeDrawing(saved), redo: () => saveDrawing(saved) });
        return;
      }
      // With the text tool a tap writes: on a text box it changes that box, elsewhere it starts a new one.
      if (drawTool !== "text" || editingText) return;
      const box = target.closest<HTMLElement>(".draw-text");
      const existing = box && drawings.find((d) => d.id === box.dataset.draw);
      if (existing) return setEditingText(existing);
      const at = renderer.current?.hitTest(e.clientX, e.clientY);
      if (at) setEditingText({ id: "new", bookId, page: at.page, tool: "text", color: drawColor, size: drawSize, points: [at.x, at.y], text: "", createdAt: 0, updatedAt: 0 });
      return;
    }
    if (erasing) {
      // The eraser takes a drawing with one tap, like a highlight.
      const drawn = drawings.find((d) => d.id === target.closest<SVGElement | HTMLElement>("[data-draw]")?.dataset.draw);
      if (drawn) {
        await removeDrawing(drawn);
        record({ undo: () => saveDrawing(drawn), redo: () => removeDrawing(drawn) });
        setToast({ text: t("Drawing removed"), undo: takeBack });
        return;
      }
    }
    if (getSelection()?.toString()) return;
    const hit = renderer.current?.hitTest(e.clientX, e.clientY);
    if (placing) {
      setPlacing(false);
      if (!hit) return;
      const noteW = 220 / hit.box.width;
      const noteH = 150 / hit.box.height;
      // The note goes where the tap is on the page as shown; its place is kept on the page as the PDF has it.
      const [x, y] = fromViewPoint(
        Math.min(Math.max(0, hit.vx - noteW / 2), Math.max(0, 1 - noteW)),
        Math.min(Math.max(0, hit.vy - 0.02), Math.max(0, 1 - noteH)),
        renderer.current!.turnValue,
      );
      const created = await annotations.saveSticky({ bookId, page: hit.page, color: "yellow", text: "", collapsed: false, x, y });
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
      const turn = renderer.current!.turnValue;
      if (n) return setPopover({ type: "note", draft: n, anchor: anchorFor(pageEl, n.rects, turn) });
      if (h) return setPopover({ type: "highlight", id: h.id, anchor: anchorFor(pageEl, h.rects, turn) });
    }
    // While the pages move by themselves, a tap on the page holds them and lets them go again.
    if (auto.open) return auto.toggle();
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
  const markStyle = settings.markStyle.value;
  const touchOnly = matchMedia("(hover: none)").matches;

  /** Everything the reader can do, for the command list (Ctrl/Cmd+K). Built when the list opens. */
  const commands = (): Command[] => {
    const tool = (on: boolean, set: (on: boolean) => void) => () => {
      offModes();
      set(!on);
    };
    const list: (Command | false)[] = [
      { id: "search", title: t("Search in book"), icon: "search", keys: keys("Mod+F"), run: search.show },
      { id: "goto", title: t("Go to page"), icon: "chevronRight", keys: "G", run: () => setSheet("goto") },
      outline.length > 0 && { id: "toc", title: t("Contents"), icon: "list", run: () => setPanel("contents") },
      { id: "pages", title: t("Pages"), icon: "grid", run: () => setPanel("pages") },
      backStack.length > 0 && { id: "back", title: t("Back to page {n}", { n: backStack.at(-1)!.page }), icon: "back", keys: keys("Alt+←"), run: goBack },
      { id: "highlight", title: t("Highlight text"), icon: "highlighter", run: tool(highlightMode, setHighlightMode) },
      { id: "erase", title: t("Erase highlights and notes"), icon: "eraser", run: tool(erasing, setErasing) },
      { id: "sticky", title: t("Add sticky note"), icon: "sticky", run: tool(placing, setPlacing) },
      { id: "draw", title: t("Draw"), icon: "draw", run: tool(drawMode, setDrawMode) },
      { id: "bookmark", title: t(bookmarked ? "Remove bookmark" : "Bookmark this page"), icon: "bookmark", keys: "B", run: () => toggleBookmark(page) },
      { id: "notes", title: t("Notes and highlights"), icon: "notes", run: () => setPanelOpen(true) },
      { id: "read", title: t("Read aloud"), icon: "headphones", run: () => (readAloud.open ? readAloud.close() : startReadAloud()) },
      { id: "auto", title: t("Auto-scroll"), icon: "autoScroll", keys: "A", run: () => (auto.open ? auto.stop() : startAuto()) },
      { id: "appearance", title: t("Appearance"), icon: "palette", run: () => setSheet("appearance") },
      { id: "zoom-in", title: t("Zoom in"), icon: "plus", keys: keys("Mod++"), run: () => renderer.current?.zoomBy(ZOOM_STEP) },
      { id: "zoom-out", title: t("Zoom out"), icon: "minus", keys: keys("Mod+-"), run: () => renderer.current?.zoomBy(1 / ZOOM_STEP) },
      { id: "fit-width", title: t("Fit width"), keys: keys("Mod+0"), run: () => renderer.current?.fitWidth() },
      { id: "fit-page", title: t("Fit page"), run: () => renderer.current?.fitPage() },
      ...LAYOUTS.map(([value, label]): Command => ({ id: `layout-${value}`, title: `${t("Layout")}: ${t(label)}`, run: () => saveSetting("viewLayout", value) })),
      ...STYLES.map(([value, label]): Command => ({ id: `style-${value}`, title: `${t("Page")}: ${t(label)}`, run: () => saveSetting("pageStyle", value) })),
      { id: "crop", title: t("Crop margins"), run: () => toggleCrop(!crop?.on) },
      { id: "rotate-right", title: t("Rotate right"), icon: "rotateRight", keys: "R", run: () => rotate(90) },
      { id: "rotate-left", title: t("Rotate left"), icon: "rotateLeft", keys: keys("Shift+R"), run: () => rotate(-90) },
      canFullscreen && { id: "fullscreen", title: t(fullscreen ? "Leave full screen" : "Full screen"),
        run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()) },
      { id: "undo", title: t("Undo"), icon: "undo", keys: keys("Mod+Z"), run: undo },
      { id: "redo", title: t("Redo"), icon: "redo", keys: keys("Mod+Shift+Z"), run: redo },
      { id: "print", title: t("Print"), icon: "print", run: () => { setSheet("menu"); print(); } },
      { id: "save", title: t("Save a copy"), icon: "download", run: saveCopy },
      !touchOnly && { id: "shortcuts", title: t("Keyboard shortcuts"), icon: "keyboard", keys: "?", run: () => setSheet("shortcuts") },
      { id: "library", title: t("Back to library"), icon: "back", run: () => navigate({ name: "library" }) },
      ...outline.slice(0, 300).map((item, i): Command => ({
        id: `toc-${i}`, title: item.title, hint: t("Page {page}", { page: item.page }), icon: "list", run: () => jump(item.page),
      })),
    ];
    return list.filter((c): c is Command => !!c);
  };

  const chapterStarts = total > 1 ? outline.filter((o) => o.depth === 0 && o.page > 1).map((o) => (o.page - 1) / total) : [];
  const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  // The reading tools: in the top bar on wide screens, in a dock at the bottom on phones (where the thumb is).
  const offModes = () => { setHighlightMode(false); setPlacing(false); setErasing(false); setDrawMode(false); };
  const tools = (
    <div class="tools" role="toolbar" aria-label={t("Reading tools")}>
      <IconButton data-tool="highlight" label={t("Highlight text")} icon="highlighter" class={highlightMode ? "is-on" : ""}
        aria-pressed={highlightMode} disabled={!ready} onClick={() => { const on = !highlightMode; offModes(); setHighlightMode(on); }} />
      <IconButton data-tool="erase" label={t("Erase highlights and notes")} icon="eraser" class={erasing ? "is-on" : ""}
        aria-pressed={erasing} disabled={!ready} onClick={() => { const on = !erasing; offModes(); setErasing(on); }} />
      <IconButton data-tool="sticky" label={t("Add sticky note")} icon="sticky" class={placing ? "is-on" : ""}
        aria-pressed={placing} disabled={!ready} onClick={() => { const on = !placing; offModes(); setPlacing(on); }} />
      <IconButton data-tool="draw" label={t("Draw")} icon="draw" class={drawMode ? "is-on" : ""}
        aria-pressed={drawMode} disabled={!ready} onClick={() => { const on = !drawMode; offModes(); setDrawMode(on); }} />
      <IconButton data-tool="bookmark" label={t(bookmarked ? "Remove bookmark" : "Bookmark this page")} icon="bookmark"
        class={bookmarked ? "is-on fill-on" : ""} aria-pressed={bookmarked} disabled={!ready}
        onClick={() => toggleBookmark(page)} />
      <IconButton data-tool="read" label={t("Read aloud")} icon="headphones" class={readAloud.open ? "is-on" : ""} aria-pressed={readAloud.open}
        disabled={!ready} onClick={() => (readAloud.open ? readAloud.close() : startReadAloud())} />
      <IconButton data-tool="notes" label={t("Notes and highlights")} icon="notes" class={panel === "notes" ? "is-on fill-on" : ""} aria-pressed={panel === "notes"}
        onClick={() => togglePanel("notes")} />
      <IconButton data-tool="contents" label={t("Contents")} icon="list" class={panel === "contents" ? "is-on" : ""} aria-pressed={panel === "contents"}
        onClick={() => togglePanel("contents")} disabled={!outline.length} />
      <IconButton data-tool="appearance" label={t("Appearance")} icon="palette" onClick={() => setSheet("appearance")} />
    </div>
  );

  return (
    <div class={`reader ${barsHidden ? "bars-hidden" : ""} ${panelOpen ? "panel-open" : ""} ${readAloud.open || auto.open ? "reading" : ""} ${search.open ? "searching" : ""}`} data-style={pageStyle}>
      <header class="reader-top">
        <IconButton label={t("Back to library")} icon="back" class="top-back" onClick={() => navigate({ name: "library" })} />
        <div class="reader-title">
          <strong>{book?.title ?? ""}</strong>
          {chapter && <span>{chapter.item.title}</span>}
        </div>
        <IconButton label={t("Search in book")} icon="search" class={`top-search ${search.open ? "is-on" : ""}`}
          aria-pressed={search.open} disabled={!ready} onClick={() => (search.open ? search.close() : search.show())} />
        <IconButton label={t("Book menu")} icon="more" class="top-menu" disabled={!ready} onClick={() => setSheet("menu")} />
        {!narrow && tools}
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
          <span>{t(areaMode ? "Drag over a part of the page" : MODE_TEXT[markStyle])}</span>
          <button type="button" class={`mode-style mode-area ${areaMode ? "is-on" : ""}`} aria-pressed={areaMode}
            aria-label={t("Mark an area")} title={t("Mark an area")} onClick={() => setAreaMode((on) => !on)}>
            <Icon name="area" size={16} />
          </button>
          <button type="button" class="mode-style" disabled={areaMode} aria-label={t("Mark style: {style}", { style: t(MODE_STYLE[markStyle]) })}
            title={t("Mark style: {style}", { style: t(MODE_STYLE[markStyle]) })} style={{ "--hl": COLOR_HEX[penColor] }}
            onClick={() => saveSetting("markStyle", MARK_STYLES[(MARK_STYLES.indexOf(markStyle) + 1) % MARK_STYLES.length])}>
            <b class={`as-${markStyle}`} aria-hidden="true">A</b>
          </button>
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
        {backStack.length > 0 && (
          <button type="button" class="back-pill" onClick={goBack}
            aria-label={t("Back to page {n}", { n: backStack.at(-1)!.page })} title={t("Back to page {n}", { n: backStack.at(-1)!.page })}>
            <Icon name="back" size={16} /><span>{backStack.at(-1)!.page}</span>
          </button>
        )}
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

      {drawMode && (
        <div class="mode-hint is-draw" role="toolbar" aria-label={t("Drawing")}>
          <div class="draw-tools" role="radiogroup" aria-label={t("What to draw")}>
            {DRAW_TOOLS.map((tool) => (
              <button type="button" role="radio" aria-checked={drawTool === tool} aria-label={t(DRAW_TOOL_LABEL[tool])} title={t(DRAW_TOOL_LABEL[tool])}
                onClick={() => { saveSetting("drawTool", tool); if (tool === "sign" && !settings.signature.value.length) setSigning(true); }}>
                <Icon name={DRAW_TOOL_ICON[tool]} size={18} /></button>
            ))}
          </div>
          {drawTool === "sign" && (
            <button type="button" class="mode-done sign-again" onClick={() => setSigning(true)}>{t("New signature")}</button>
          )}
          <div class="mode-colors" role="radiogroup" aria-label={t("Color")}>
            {DRAW_COLORS.map((c) => (
              <button type="button" role="radio" aria-checked={drawColor === c} aria-label={t(DRAW_LABEL[c])} title={t(DRAW_LABEL[c])}
                class={`swatch ${c === "ink" ? "draw-ink-swatch" : ""}`} style={c === "ink" ? undefined : { background: DRAW_HEX[c] }}
                onClick={() => saveSetting("drawColor", c)} />
            ))}
          </div>
          <div class="draw-sizes" role="radiogroup" aria-label={t("Thickness")}>
            {DRAW_SIZES.map(([size, label], i) => (
              <button type="button" role="radio" aria-checked={drawSize === size} aria-label={t(label)} title={t(label)}
                onClick={() => saveSetting("drawSize", size)}><i style={{ height: `${2 + i * 2}px` }} /></button>
            ))}
          </div>
          <button type="button" class="mode-done" onClick={() => setDrawMode(false)}>{t("Done")}</button>
        </div>
      )}

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
        : <div class={`reader-scroll ${placing ? "is-placing" : ""} ${erasing ? "is-erasing" : ""} ${highlightMode ? "is-highlighting" : ""} ${highlightMode && areaMode ? "is-area" : ""} ${drawMode ? "is-drawing" : ""} ${drawMode && drawTool === "text" ? "is-text-tool" : ""} ${drawMode && drawTool === "sign" ? "is-sign-tool" : ""}`}
            ref={scroller} tabIndex={0} aria-label={t("Pages")} onClick={onPageTap} {...linkPointer} />}

      {preview && renderer.current && (
        <LinkPreview renderer={renderer.current} target={preview.target} anchor={preview.anchor}
          onGo={preview.touch ? () => { const { target } = preview; setPreview(null); jump(target.page, placeOf(target)); } : undefined}
          onEnter={() => clearTimeout(closeTimer.current)} onLeave={() => !preview.touch && setPreview(null)} />
      )}

      {narrow && <div class="dock">{tools}</div>}
      <ReadAloudBar ra={readAloud} page={page} />
      <AutoScrollBar auto={auto} />

      {selection && !highlightMode && (
        <SelectionBar
          anchor={selection.anchor}
          onHighlight={(c) => highlightSelection(c)}
          onNote={noteSelection}
          onCopy={() => { copy(selection.text); getSelection()?.removeAllRanges(); setSelection(null); }}
          onLookup={wordToLookUp(selection.text) ? () => { setLookupWord(wordToLookUp(selection.text)); getSelection()?.removeAllRanges(); setSelection(null); } : undefined}
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
            onStyle={(s) => restyleHighlight(h, s)}
            onShare={() => { setQuote({ text: h.text, source: { title: book?.title ?? "", author: book?.author ?? "", page: h.page } }); setPopover(null); }}
            onCopy={() => { copy(h.text); setPopover(null); }}
            isArea={!h.text}
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
          <SidePanel section={panel!} onSection={setPanel} onClose={() => setPanel(null)}>
            {panel === "notes" && (
              <NotesPanel title={book?.title ?? t("Notes")} data={annotations.data} onJump={jumpTo} onCopy={copy} onRemove={removeEntry} />
            )}
            {panel === "contents" && (
              <div class="panel-body">
                {outline.length === 0 && <p class="panel-empty">{t("This book has no table of contents.")}</p>}
                {madeOutline && <p class="toc-made">{t("Made from the headings of this book.")}</p>}
                <ol class="toc">
                  {outline.map((item) => (
                    <li style={{ paddingInlineStart: `${item.depth * 16}px` }}>
                      <button type="button" aria-current={chapter?.item === item ? "true" : undefined}
                        onClick={() => { jump(item.page); leavePanel(); }}>
                        <span>{item.title}</span><span class="toc-page">{item.page}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {panel === "pages" && renderer.current && (
              <div class="panel-body">
                <PageGrid renderer={renderer.current} total={total} current={page} bookmarked={bookmarkedPages} noted={notedPages}
                  onPick={(n) => { jump(n); leavePanel(); }} />
              </div>
            )}
          </SidePanel>
        </>
      )}

      <Sheet open={sheet === "goto"} title={t("Go to page")} onClose={() => setSheet(null)}>
        <form class="goto" onSubmit={(e) => { e.preventDefault(); jump(Number(pageInput)); setSheet(null); }}>
          <input aria-label={t("Page number")} inputMode="numeric" autoFocus={!matchMedia("(hover: none)").matches} value={pageInput}
            onFocus={(e) => e.currentTarget.select()}
            onInput={(e) => setPageInput(e.currentTarget.value)} />
          <span>{t("of {total}", { total })}</span>
          <Button variant="primary" type="submit">{t("Go")}</Button>
        </form>
        {renderer.current && sheet === "goto" && (
          <PageGrid renderer={renderer.current} total={total} current={page} bookmarked={bookmarkedPages} noted={notedPages}
            onPick={(n) => { jump(n); setSheet(null); }} />
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
              <button type="button" onClick={() => { setSheet(null); setPalette(true); }}>
                <Icon name="search" />
                <span><strong>{t("Find a command")}</strong><small>{t("Every action of the reader in one list.")}</small></span>
                {!touchOnly && <kbd dir="ltr">{keys("Mod+K")}</kbd>}
              </button>
            </li>
            <li>
              <button type="button" onClick={startAuto}>
                <Icon name="autoScroll" />
                <span><strong>{t("Auto-scroll")}</strong><small>{t("The pages move by themselves, at the speed you set.")}</small></span>
              </button>
            </li>
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
            <li>
              {marked?.state === "ready" ? (
                <button type="button" class="is-ready" onClick={async () => { if (await saveFile(marked.file)) closeMenu(); }}>
                  <Icon name="download" />
                  <span><strong>{t("Save the PDF with your marks")}</strong><small>{formFilled && exportCount(annotations.data, drawings) === 0
                    ? t("Ready: the filled form is inside.") : t("Ready: {n} marks and notes inside.", { n: exportCount(annotations.data, drawings) })}</small></span>
                </button>
              ) : (
                <button type="button" disabled={marked?.state === "building" || (exportCount(annotations.data, drawings) === 0 && !formFilled)} onClick={buildMarked}>
                  <Icon name="highlighter" />
                  <span>
                    <strong>{t(hasForm ? "Save a copy with the form and your marks" : "Save a copy with your marks")}</strong>
                    <small role="status">{t(marked?.state === "building" ? "Putting your marks into the PDF…"
                      : marked?.state === "failed" ? "This PDF could not be written. Its marks are still in the app."
                      : exportCount(annotations.data, drawings) === 0 && !formFilled ? (hasForm ? "Fill in the form on the page first." : "This book has no marks or notes yet.")
                      : hasForm ? "What you filled in and marked becomes part of the PDF."
                      : "Highlights and notes become part of the PDF, for other apps to show.")}</small>
                  </span>
                </button>
              )}
            </li>
            <li>
              <button type="button" onClick={() => { setMarked(null); setSheet("ocr"); }}>
                <Icon name="scan" />
                <span><strong>{t("Recognize text")}</strong><small>{t("For scanned pages: makes their words selectable, searchable and readable aloud.")}</small></span>
              </button>
            </li>
            {!touchOnly && (
              <li>
                <button type="button" onClick={() => setSheet("shortcuts")}>
                  <Icon name="keyboard" />
                  <span><strong>{t("Keyboard shortcuts")}</strong><small>{t("What each key does.")}</small></span>
                  <kbd>?</kbd>
                </button>
              </li>
            )}
          </ul>
        )}
      </Sheet>

      <ShortcutSheet open={sheet === "shortcuts"} onClose={() => setSheet(null)} />
      <LookupSheet word={lookupWord} onClose={() => setLookupWord(null)} />
      <SignaturePad open={signing} onClose={() => setSigning(false)} onSave={(points) => { saveSetting("signature", points); setSigning(false); }} />
      <Sheet open={sheet === "ocr"} title={t("Recognize text")} onClose={() => setSheet(null)}>
        <div class="ocr-sheet">
          <p>{t("Pages that are pictures (scans, photographs of a book) have no text to select or search. This reads the words off those pages. It runs on this device: the pages are not sent anywhere.")}</p>
          {ocr?.state === "running" ? (
            <div class="print-progress" role="status">
              <p>{ocr.loading ? t("Getting the recognition engine ready…")
                : t("Reading page {n} of {total}. Text found on {found} so far.", { n: ocr.page, total: ocr.total, found: ocr.found })}</p>
              <progress value={ocr.page} max={ocr.total} />
              <Button onClick={() => { ocrStop.current.now = true; setOcr(null); }}>{t("Stop")}</Button>
            </div>
          ) : (
            <>
              <fieldset class="seg">
                <legend>{t("Language of the pages")}</legend>
                {OCR_LANGS.map(([value, label]) => (
                  <label><input type="radio" name="ocrLang" checked={ocrLang === value} onChange={() => setOcrLang(value)} />{t(label)}</label>
                ))}
              </fieldset>
              {ocr?.state === "done" && (
                <p class="ocr-result" role="status">{t(ocr.found === 0 ? "No new scanned pages with words were found."
                  : ocr.found === 1 ? "Text was recognized on 1 page." : "Text was recognized on {n} pages.", { n: ocr.found })}</p>
              )}
              {ocr?.state === "failed" && <p class="ocr-result" role="alert">{t("Text recognition could not start. Check the connection and try again.")}</p>}
              <p class="toggle-note ocr-note">{t("The first time, about 7 MB is loaded for the engine and the language. Pages already read are kept.")}</p>
              <div class="sheet-actions">
                <Button variant="primary" onClick={recognize} disabled={!ready}>{t("Start")}</Button>
              </div>
            </>
          )}
        </div>
      </Sheet>
      <QuoteSheet quote={quote} onClose={() => setQuote(null)} />
      {touring && ready && !sheet && <Tour onDone={() => setTouring(false)} />}
      {palette && <CommandPalette commands={commands()} pages={total} onGoToPage={jump} onClose={() => setPalette(false)} />}

      <PasswordSheet locked={locked && book ? {
        name: book.fileName, wrong: locked.wrong,
        answer: (password) => {
          if (password === null) return navigate({ name: "library" });
          setLocked(null);
          setAttempt({ password });
        },
      } : null} />

      <Sheet open={sheet === "appearance"} title={t("Appearance")} peek onClose={() => setSheet(null)}>
        <fieldset class="seg">
          <legend>{t("Page")}</legend>
          {STYLES.map(([value, label]) => (
            <label><input type="radio" name="pageStyle" checked={pageStyle === value}
              onChange={() => saveSetting("pageStyle", value)} /><Swatch {...pageColors(value, darkTheme)} />{t(label)}</label>
          ))}
        </fieldset>
        {pageStyle === "dark" && (
          <>
            <fieldset class="seg">
              <legend>{t("Dark theme")}</legend>
              {DARK_THEMES.map(([value, label]) => (
                <label><input type="radio" name="darkTheme" checked={darkTheme === value}
                  onChange={() => saveSetting("darkTheme", value)} /><Swatch {...themeColors(value)} />{t(label)}</label>
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
        <div class="rotate-row" role="group" aria-label={t("Rotate the pages")}>
          <span>{t("Rotate the pages")}</span>
          <IconButton label={t("Rotate left")} icon="rotateLeft" disabled={!ready} onClick={() => rotate(-90)} />
          <span class="rotate-now" dir="ltr">{turn}°</span>
          <IconButton label={t("Rotate right")} icon="rotateRight" disabled={!ready} onClick={() => rotate(90)} />
        </div>
        <label class="toggle">
          <input type="checkbox" checked={!!crop?.on} disabled={!ready || measuring !== null}
            onChange={(e) => toggleCrop(e.currentTarget.checked)} />
          {t("Crop margins")}
        </label>
        <p class="toggle-note" role="status">
          {measuring !== null ? t("Measuring the margins… {n}%", { n: measuring })
            : crop && !crop.box ? t("This book has no margins to cut.")
            : t("Larger text: the empty border of the pages is cut away. For this book only.")}
        </p>
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
