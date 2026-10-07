import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import { Overlayer } from "../../../vendor/foliate-js/overlayer.js";
import { COLOR_HEX } from "../annotations/colors";
import { HighlightPopover, NotePopover } from "../annotations/Popovers";
import { SelectionBar } from "../annotations/SelectionBar";
import type { Bookmark, Highlight, HighlightColor, PassageNote } from "../db/annotations";
import type { Book, Repos } from "../db/repos";
import { t } from "../i18n/i18n";
import { copyText } from "../platform/clipboard";
import { detectLanguage } from "../readaloud/text";
import { bestVoice } from "../readaloud/voices";
import { pageColors } from "../reader/Swatch";
import { navigate } from "../router";
import { saveSetting, settings, type PageStyle } from "../settings";
import { ReadingTracker } from "../stats/tracker";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { bookStyles, tocList, type TocEntry } from "./look";
import "../annotations/annotations.css";
import "../annotations/notes.css";
import "./ebook.css";

type Anchor = { left: number; top: number; right: number; bottom: number };
/** Where the reader is, as foliate-js reports it after every move. */
type Place = { cfi: string; fraction: number; index: number; loc: number; chapter: string; href: string; range?: Range };
type Hit = { cfi: string; excerpt: { pre: string; match: string; post: string } };
type Found = { label: string; hits: Hit[] };

/** The parts of foliate-js's view that are used here. */
type FoliateView = HTMLElement & {
  book: { toc?: unknown[]; dir?: string; metadata?: { language?: unknown } };
  renderer: HTMLElement & { setStyles?(css: string): void; getContents(): { doc: Document; index: number }[]; scrollToAnchor(range: Range, select?: boolean): Promise<void> };
  lastLocation?: { cfi?: string; range?: Range };
  open(file: File): Promise<void>;
  init(options: { lastLocation?: string | null; showTextStart?: boolean }): Promise<void>;
  close(): void;
  goTo(target: string | number): Promise<unknown>;
  goToFraction(fraction: number): Promise<void>;
  next(): Promise<void>;
  prev(): Promise<void>;
  goLeft(): Promise<void>;
  goRight(): Promise<void>;
  getCFI(index: number, range: Range): string;
  addAnnotation(annotation: { value: string }): Promise<unknown>;
  deleteAnnotation(annotation: { value: string }): Promise<unknown>;
  search(options: { query: string }): AsyncGenerator<"done" | { progress: number } | { label: string; subitems: Hit[] }>;
  clearSearch(): void;
  deselect(): void;
  initTTS(granularity: string, highlight?: (range: Range) => void): Promise<void>;
  tts?: { start(): string | undefined; next(): string | undefined; from(range: Range): string | undefined };
};

const STYLES: [PageStyle, string][] = [["original", "Original"], ["sepia", "Sepia"], ["dark", "Smart dark"]];
const FONT_STEPS = [80, 90, 100, 110, 125, 140, 160, 180, 200];

/** A range inside the book's frame, as a box on the screen. */
function onScreen(range: Range): Anchor {
  const box = range.getBoundingClientRect();
  const frame = range.startContainer.ownerDocument?.defaultView?.frameElement?.getBoundingClientRect();
  const dx = frame?.left ?? 0, dy = frame?.top ?? 0;
  return { left: box.left + dx, top: box.top + dy, right: box.right + dx, bottom: box.bottom + dy };
}

/** The reader for books that flow: EPUB, MOBI, FB2 and CBZ, drawn by foliate-js. */
export function EbookScreen({ repos, book, startPage }: { repos: Repos; book: Book; startPage?: number }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<FoliateView | null>(null);
  const [state, setState] = useState<"opening" | "ready" | "failed">("opening");
  const [place, setPlace] = useState<Place | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [sheet, setSheet] = useState<"contents" | "search" | "notes" | "look" | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [notes, setNotes] = useState<PassageNote[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [selection, setSelection] = useState<{ anchor: Anchor; cfi: string; text: string; index: number } | null>(null);
  const [openMark, setOpenMark] = useState<{ kind: "highlight" | "note"; id: string; anchor: Anchor } | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [speaking, setSpeaking] = useState<"off" | "playing" | "paused">("off");
  // Focus: the bars go away and only the book is left.
  const [focus, setFocus] = useState(false);
  const focusNow = useRef(focus);
  focusNow.current = focus;
  const style = settings.pageStyle.value, theme = settings.darkTheme.value;
  const fontSize = settings.ebookFontSize.value, flow = settings.ebookFlow.value;

  // The marks as the handlers of the book's frame need them: always the newest.
  const marks = useRef({ highlights, notes });
  marks.current = { highlights, notes };
  const tracker = useRef<ReadingTracker | null>(null);
  const tapped = useRef(0); // when a mark was last tapped: that tap must not turn the page

  const applyLook = () => {
    const v = view.current;
    if (!v) return;
    v.renderer.setAttribute("flow", settings.ebookFlow.value);
    v.renderer.setAttribute("gap", "6%");
    v.renderer.setAttribute("max-inline-size", "680px");
    v.renderer.setStyles?.(bookStyles(settings.pageStyle.value, settings.darkTheme.value, settings.ebookFontSize.value));
  };
  useEffect(applyLook, [style, theme, fontSize, flow]);

  // Draws one mark on the page that holds it. The colors are the ones the PDF reader uses.
  const draw = (cfi: string) => view.current?.addAnnotation({ value: cfi });

  useEffect(() => {
    let closed = false;
    const tracking = new ReadingTracker(repos.sessions, book.id);
    tracker.current = tracking;
    const onActivity = () => tracking.activity();
    const onVisibility = () => tracking.setVisible(document.visibilityState === "visible");
    addEventListener("pointerdown", onActivity);
    addEventListener("keydown", onActivity);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = setInterval(() => tracking.tick(), 5000);

    (async () => {
      try {
        const [file, progress, all] = await Promise.all([repos.books.file(book.id), repos.progress.get(book.id), repos.annotations.listForBook(book.id)]);
        if (!file) throw new Error("the book's file is missing");
        await import("../../../vendor/foliate-js/view.js");
        if (closed) return;
        const v = document.createElement("foliate-view") as FoliateView;
        view.current = v;
        host.current!.append(v);
        setHighlights(all.highlights);
        setNotes(all.notes);
        setBookmarks(all.bookmarks);
        marks.current = { highlights: all.highlights, notes: all.notes };

        v.addEventListener("relocate", (e) => {
          const d = (e as CustomEvent).detail as { cfi: string; fraction: number; range?: Range; section?: { current: number }; location?: { current: number }; tocItem?: { label?: string; href?: string } };
          const index = d.section?.current ?? 0;
          const next: Place = { cfi: d.cfi, fraction: d.fraction ?? 0, index, loc: d.location?.current ?? 0, chapter: d.tocItem?.label?.trim() ?? "", href: d.tocItem?.href ?? "", range: d.range };
          setPlace(next);
          setSelection(null);
          setOpenMark(null);
          tracking.setPage(index + 1);
          tracking.activity();
          repos.progress.save(book.id, index + 1, 0, { cfi: next.cfi, fraction: next.fraction });
          if (next.fraction >= 0.995 && !book.finishedAt) repos.books.update(book.id, { finishedAt: Date.now() });
        });
        // A section (chapter file) was put on screen: its marks are drawn, and its frame gets the reader's handlers.
        v.addEventListener("create-overlay", (e) => {
          const { index } = (e as CustomEvent).detail as { index: number };
          for (const mark of [...marks.current.highlights, ...marks.current.notes]) if (mark.cfi && mark.page === index + 1) draw(mark.cfi);
        });
        v.addEventListener("draw-annotation", (e) => {
          const { draw: paint, annotation } = (e as CustomEvent).detail as { draw: (fn: unknown, options: unknown) => void; annotation: { value: string } };
          const highlight = marks.current.highlights.find((h) => h.cfi === annotation.value);
          if (highlight) paint(Overlayer.highlight, { color: COLOR_HEX[highlight.color] });
          else if (marks.current.notes.some((n) => n.cfi === annotation.value)) paint(Overlayer.squiggly, { color: "#e0a030", width: 2 });
        });
        v.addEventListener("show-annotation", (e) => {
          const { value, range } = (e as CustomEvent).detail as { value: string; range: Range };
          tapped.current = Date.now();
          const highlight = marks.current.highlights.find((h) => h.cfi === value);
          const note = marks.current.notes.find((n) => n.cfi === value);
          if (highlight) setOpenMark({ kind: "highlight", id: highlight.id, anchor: onScreen(range) });
          else if (note) setOpenMark({ kind: "note", id: note.id, anchor: onScreen(range) });
        });
        v.addEventListener("load", (e) => {
          const { doc, index } = (e as CustomEvent).detail as { doc: Document; index: number };
          let settle = 0;
          const readSelection = () => {
            const sel = doc.defaultView?.getSelection();
            const text = sel?.toString().trim() ?? "";
            if (!sel || sel.isCollapsed || !text) return setSelection(null);
            const range = sel.getRangeAt(0);
            setOpenMark(null);
            setSelection({ anchor: onScreen(range), cfi: v.getCFI(index, range), text, index });
          };
          doc.addEventListener("selectionchange", () => {
            clearTimeout(settle);
            settle = window.setTimeout(readSelection, 250);
          });
          doc.addEventListener("pointerdown", onActivity);
          // A tap on the left or right third of the page turns it, as on paper. Text selection and links stay as they are.
          doc.addEventListener("click", (event) => {
            if ((event.target as Element).closest?.("a[href]") || !doc.defaultView?.getSelection()?.isCollapsed) return;
            const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
            const x = event.clientX + (frame?.left ?? 0), width = host.current?.clientWidth ?? innerWidth;
            setTimeout(() => {
              if (Date.now() - tapped.current < 300 || settings.ebookFlow.value !== "paginated") return;
              setOpenMark(null);
              if (x < width * 0.3) v.goLeft();
              else if (x > width * 0.7) v.goRight();
              // The middle of the page: the bars go away, or come back.
              else setFocus(!focusNow.current);
            });
          });
          doc.addEventListener("keydown", onKey.current);
        });
        v.addEventListener("external-link", (e) => {
          // A link out of the book opens in the browser, never inside the reader.
          e.preventDefault();
          const href = ((e as CustomEvent).detail as { a: HTMLAnchorElement }).a.href;
          if (/^https?:/.test(href)) window.open(href, "_blank", "noopener");
        });

        await v.open(new File([file], book.fileName, { type: file.type }));
        if (closed) return;
        setToc(tocList(v.book.toc));
        applyLook();
        if (startPage) await v.init({ showTextStart: false }).then(() => v.goTo(startPage - 1));
        else await v.init({ lastLocation: progress?.cfi ?? null, showTextStart: !progress?.cfi });
        if (closed) return;
        repos.books.update(book.id, { lastOpenedAt: Date.now() });
        setState("ready");
      } catch (error) {
        console.error("Could not open the book", error);
        if (!closed) setState("failed");
      }
    })();

    return () => {
      closed = true;
      clearInterval(timer);
      tracking.tick();
      tracking.flush();
      removeEventListener("pointerdown", onActivity);
      removeEventListener("keydown", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
      speechSynthesis?.cancel();
      view.current?.close();
      view.current?.remove();
      view.current = null;
    };
  }, []);

  // Keys, also while the book's own frame has the focus. A ref, so the newest state is used.
  const onKey = useRef((_: KeyboardEvent) => {});
  onKey.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (sheet || el.closest?.("input, textarea, select, [contenteditable], .popover") || e.metaKey || e.ctrlKey || e.altKey) return;
    const v = view.current;
    if (!v) return;
    if (e.key === "ArrowLeft") v.goLeft();
    else if (e.key === "ArrowRight") v.goRight();
    else if (e.key === "PageDown" || (e.key === " " && !e.shiftKey)) v.next();
    else if (e.key === "PageUp" || (e.key === " " && e.shiftKey)) v.prev();
    else if (e.key === "f" || e.key === "F") setFocus(!focus);
    else if (e.key === "Escape") { setSelection(null); setOpenMark(null); setFocus(false); return; }
    else return;
    e.preventDefault();
  };
  useLayoutEffect(() => {
    const handler = (e: KeyboardEvent) => onKey.current(e);
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, []);

  // Marks
  const addHighlight = async (color: HighlightColor) => {
    if (!selection) return;
    const saved = await repos.annotations.putHighlight({ bookId: book.id, page: selection.index + 1, rects: [], color, text: selection.text, cfi: selection.cfi });
    marks.current = { ...marks.current, highlights: [...marks.current.highlights, saved] };
    setHighlights(marks.current.highlights);
    view.current?.deselect();
    setSelection(null);
    draw(selection.cfi);
  };
  const addNote = async () => {
    if (!selection) return;
    const saved = await repos.annotations.putNote({ bookId: book.id, page: selection.index + 1, rects: [], text: selection.text, body: "", cfi: selection.cfi });
    marks.current = { ...marks.current, notes: [...marks.current.notes, saved] };
    setNotes(marks.current.notes);
    view.current?.deselect();
    setOpenMark({ kind: "note", id: saved.id, anchor: selection.anchor });
    setSelection(null);
    draw(selection.cfi);
  };
  const changeHighlight = async (highlight: Highlight, color: HighlightColor) => {
    const saved = await repos.annotations.putHighlight({ ...highlight, color });
    marks.current = { ...marks.current, highlights: marks.current.highlights.map((h) => (h.id === saved.id ? saved : h)) };
    setHighlights(marks.current.highlights);
    if (saved.cfi) draw(saved.cfi);
  };
  const removeHighlight = async (highlight: Highlight) => {
    await repos.annotations.remove("highlights", highlight.id);
    marks.current = { ...marks.current, highlights: marks.current.highlights.filter((h) => h.id !== highlight.id) };
    setHighlights(marks.current.highlights);
    setOpenMark(null);
    if (highlight.cfi) view.current?.deleteAnnotation({ value: highlight.cfi });
  };
  const saveNote = async (note: PassageNote, body: string, title: string) => {
    const saved = await repos.annotations.putNote({ ...note, body, title: title || undefined });
    marks.current = { ...marks.current, notes: marks.current.notes.map((n) => (n.id === saved.id ? saved : n)) };
    setNotes(marks.current.notes);
    setOpenMark(null);
  };
  const removeNote = async (note: PassageNote) => {
    await repos.annotations.remove("notes", note.id);
    marks.current = { ...marks.current, notes: marks.current.notes.filter((n) => n.id !== note.id) };
    setNotes(marks.current.notes);
    setOpenMark(null);
    if (note.cfi) view.current?.deleteAnnotation({ value: note.cfi });
  };

  // Bookmarks stand at a "location", foliate's fixed-size step through the text: the same place at any font size.
  const marked = place ? bookmarks.find((b) => b.loc === place.loc) : undefined;
  const toggleBookmark = async () => {
    if (!place) return;
    if (marked) {
      await repos.annotations.remove("bookmarks", marked.id);
      setBookmarks(bookmarks.filter((b) => b.id !== marked.id));
    } else {
      const saved = await repos.annotations.putBookmark({ bookId: book.id, page: place.index + 1, cfi: place.cfi, loc: place.loc, label: place.chapter });
      setBookmarks([...bookmarks, saved]);
    }
  };

  const goTo = (cfi: string | undefined) => {
    setSheet(null);
    if (cfi) view.current?.goTo(cfi);
  };

  // Search: every match in the book, chapter by chapter.
  const searchRun = useRef(0);
  const search = async (words: string) => {
    const run = ++searchRun.current;
    view.current?.clearSearch();
    setFound(null);
    if (!words.trim() || !view.current) return setSearching(false);
    setSearching(true);
    const groups: Found[] = [];
    for await (const result of view.current.search({ query: words.trim() })) {
      if (run !== searchRun.current) return;
      if (typeof result === "object" && "subitems" in result) {
        groups.push({ label: result.label, hits: result.subitems });
        setFound([...groups]);
      }
    }
    if (run !== searchRun.current) return;
    setFound([...groups]);
    setSearching(false);
  };
  const closeSearch = () => {
    setSheet(null);
    if (!query.trim()) view.current?.clearSearch();
  };

  // Read aloud with a voice of the device, a block of text at a time. The page follows the voice.
  const speakNext = (ssml: string | undefined) => {
    const v = view.current;
    if (!v) return;
    if (!ssml) {
      // The end of this section: go on with the next one, or stop at the end of the book.
      const before = v.renderer.getContents()[0]?.index;
      v.next().then(async () => {
        if (v.renderer.getContents()[0]?.index === before) return setSpeaking("off");
        await v.initTTS("sentence");
        speakNext(v.tts?.start());
      });
      return;
    }
    const text = new DOMParser().parseFromString(ssml, "application/xml").documentElement.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text) return speakNext(v.tts?.next());
    const lang = detectLanguage(text, "en");
    const voices = speechSynthesis.getVoices().map((voice) => ({ uri: voice.voiceURI, name: voice.name, lang: voice.lang, local: voice.localService }));
    const pick = voices.find((voice) => voice.uri === settings.readVoices.value[lang]) ?? bestVoice(voices, lang);
    const say = new SpeechSynthesisUtterance(text);
    say.lang = pick?.lang ?? lang;
    say.voice = speechSynthesis.getVoices().find((voice) => voice.voiceURI === pick?.uri) ?? null;
    say.rate = settings.readRate.value;
    say.pitch = settings.readPitch.value;
    say.onend = () => { if (reading.current) speakNext(view.current?.tts?.next()); };
    speechSynthesis.speak(say);
  };
  const reading = useRef(false);
  const toggleSpeech = async () => {
    const v = view.current;
    if (!v || !("speechSynthesis" in window)) return;
    if (speaking === "playing") { speechSynthesis.pause(); return setSpeaking("paused"); }
    if (speaking === "paused") { speechSynthesis.resume(); return setSpeaking("playing"); }
    reading.current = true;
    setSpeaking("playing");
    tracker.current?.setPlaying(true);
    await v.initTTS("sentence");
    speakNext(v.lastLocation?.range ? v.tts?.from(v.lastLocation.range) : v.tts?.start());
  };
  const stopSpeech = () => {
    reading.current = false;
    speechSynthesis.cancel();
    setSpeaking("off");
    tracker.current?.setPlaying(false);
  };

  const percent = Math.round((place?.fraction ?? 0) * 100);
  const openHighlight = openMark?.kind === "highlight" ? highlights.find((h) => h.id === openMark.id) : undefined;
  const openNote = openMark?.kind === "note" ? notes.find((n) => n.id === openMark.id) : undefined;
  const listed = useMemo(() => [
    ...bookmarks.map((b) => ({ kind: "bookmark" as const, id: b.id, page: b.page, at: b.createdAt, cfi: b.cfi, text: b.label || t("Bookmark"), body: "", color: undefined as string | undefined })),
    ...highlights.map((h) => ({ kind: "highlight" as const, id: h.id, page: h.page, at: h.createdAt, cfi: h.cfi, text: h.text, body: "", color: COLOR_HEX[h.color] })),
    ...notes.map((n) => ({ kind: "note" as const, id: n.id, page: n.page, at: n.createdAt, cfi: n.cfi, text: n.text, body: [n.title, n.body].filter(Boolean).join(": "), color: undefined })),
  ].sort((a, b) => a.page - b.page || a.at - b.at), [bookmarks, highlights, notes]);
  const paper = pageColors(style, theme);

  return (
    <div class={focus ? "ebook is-focus" : "ebook"} data-page-style={style} style={{ "--ebook-paper": paper.paper, "--ebook-ink": paper.ink }}>
      <header class="ebook-top">
        <IconButton label={t("Back to library")} icon="back" onClick={() => navigate({ name: "library" })} />
        <div class="ebook-title">
          <strong dir="auto">{book.title}</strong>
          {place?.chapter && <small dir="auto">{place.chapter}</small>}
        </div>
        <div class="ebook-tools" role="toolbar" aria-label={t("Reading tools")}>
          <IconButton label={t("Search")} text={t("Search")} icon="search" onClick={() => setSheet("search")} />
          <IconButton label={t("Contents")} text={t("Contents")} icon="list" onClick={() => setSheet("contents")} />
          <IconButton label={t(marked ? "Remove bookmark" : "Bookmark this page")} text={t("Bookmark")} icon="bookmark" class={marked ? "is-on" : ""} aria-pressed={!!marked} onClick={toggleBookmark} />
          {"speechSynthesis" in window && (
            <IconButton label={t(speaking === "playing" ? "Pause reading" : "Read aloud")} text={t(speaking === "playing" ? "Pause" : "Read aloud")} icon={speaking === "playing" ? "pause" : "headphones"} class={speaking !== "off" ? "is-on" : ""} onClick={toggleSpeech} />
          )}
          {speaking !== "off" && <IconButton label={t("Stop")} text={t("Stop")} icon="close" onClick={stopSpeech} />}
          <IconButton label={t("Notes and highlights")} text={t("Notes")} icon="notes" onClick={() => setSheet("notes")} />
          <IconButton label={t("Appearance")} text={t("Appearance")} icon="palette" onClick={() => setSheet("look")} />
          <IconButton label={t("Focus: only the book")} text={t("Focus")} icon="eye" onClick={() => setFocus(true)} />
        </div>
      </header>

      <div class="ebook-page" ref={host}>
        {state === "opening" && <p class="ebook-status" role="status">{t("Opening…")}</p>}
        {state === "failed" && (
          <div class="ebook-status" role="alert">
            <p>{t("This book could not be opened. The file may be damaged.")}</p>
            <Button onClick={() => navigate({ name: "library" })}>{t("Back to library")}</Button>
          </div>
        )}
      </div>

      <footer class="ebook-foot">
        <IconButton label={t("Previous page")} icon="chevronLeft" disabled={state !== "ready"} onClick={() => view.current?.prev()} />
        <input type="range" class="ebook-slider" min={0} max={1000} step={1} value={Math.round((place?.fraction ?? 0) * 1000)} disabled={state !== "ready"}
          aria-label={t("Place in the book")} aria-valuetext={`${percent}%`}
          onChange={(e) => view.current?.goToFraction(Number(e.currentTarget.value) / 1000)} />
        <span class="ebook-percent" dir="ltr">{percent}%</span>
        <IconButton label={t("Next page")} icon="chevronRight" disabled={state !== "ready"} onClick={() => view.current?.next()} />
      </footer>

      {focus && (
        <button type="button" class="focus-exit" onClick={() => setFocus(false)}>
          <Icon name="eye" size={16} /> {t("Show the tools")}
        </button>
      )}
      {selection && !openMark && (
        <SelectionBar anchor={selection.anchor} onHighlight={addHighlight} onNote={addNote}
          onCopy={() => { copyText(selection.text); view.current?.deselect(); setSelection(null); }} />
      )}
      {openHighlight && openMark && (
        <HighlightPopover highlight={openHighlight} anchor={openMark.anchor} isArea
          onColor={(color) => changeHighlight(openHighlight, color)} onStyle={() => {}} onShare={() => {}}
          onCopy={() => copyText(openHighlight.text)} onRemove={() => removeHighlight(openHighlight)} onClose={() => setOpenMark(null)} />
      )}
      {openNote && openMark && (
        <NotePopover note={openNote} anchor={openMark.anchor} onSave={(body, title) => saveNote(openNote, body, title)}
          onDelete={() => removeNote(openNote)} onClose={() => setOpenMark(null)} />
      )}

      <Sheet open={sheet === "contents"} title={t("Contents")} onClose={() => setSheet(null)}>
        {toc.length === 0 ? <p class="ebook-note">{t("This book has no table of contents.")}</p> : (
          <ol class="ebook-toc">
            {toc.map((item) => (
              <li>
                <button type="button" class={item.href === place?.href ? "is-current" : ""} style={{ paddingInlineStart: `${14 + item.depth * 18}px` }}
                  aria-current={item.href === place?.href ? "true" : undefined} onClick={() => goTo(item.href)}>
                  <span dir="auto">{item.label}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </Sheet>

      <Sheet open={sheet === "search"} title={t("Search in the book")} onClose={closeSearch}>
        <form class="ebook-search" onSubmit={(e) => { e.preventDefault(); search(query); }}>
          <label class="search">
            <Icon name="search" size={18} />
            <input type="search" autoFocus dir="auto" placeholder={t("Search in the book")} aria-label={t("Search in the book")} value={query}
              onInput={(e) => setQuery(e.currentTarget.value)} />
          </label>
          <Button variant="primary" type="submit" disabled={!query.trim()}>{t("Search")}</Button>
        </form>
        <p class="ebook-note" role="status">
          {searching ? t("Searching…") : found ? (found.length ? t("{n} matches", { n: found.reduce((n, g) => n + g.hits.length, 0) }) : t("No matches")) : ""}
        </p>
        {found?.map((group) => (
          <section class="ebook-found">
            {group.label && <h3 dir="auto">{group.label}</h3>}
            <ul>
              {group.hits.map((hit) => (
                <li><button type="button" dir="auto" onClick={() => goTo(hit.cfi)}>{hit.excerpt.pre}<mark>{hit.excerpt.match}</mark>{hit.excerpt.post}</button></li>
              ))}
            </ul>
          </section>
        ))}
      </Sheet>

      <Sheet open={sheet === "notes"} title={t("Notes and highlights")} onClose={() => setSheet(null)}>
        {listed.length === 0 ? <p class="ebook-note">{t("Select text to highlight it or to write a note. Bookmarks are listed here too.")}</p> : (
          <ul class="ebook-marks">
            {listed.map((item) => (
              <li>
                <button type="button" class="ebook-mark" onClick={() => goTo(item.cfi)}>
                  <span class="ebook-mark-kind" style={item.color ? { background: item.color } : undefined}>
                    <Icon name={item.kind === "bookmark" ? "bookmark" : item.kind === "note" ? "note" : "highlighter"} size={16} />
                  </span>
                  <span class="ebook-mark-text">
                    <span dir="auto">{item.text}</span>
                    {item.body && <small dir="auto">{item.body}</small>}
                  </span>
                </button>
                <IconButton label={t(item.kind === "bookmark" ? "Remove bookmark" : item.kind === "note" ? "Delete note" : "Remove highlight")} icon="trash"
                  onClick={async () => {
                    if (item.kind === "bookmark") {
                      await repos.annotations.remove("bookmarks", item.id);
                      setBookmarks(bookmarks.filter((b) => b.id !== item.id));
                    } else if (item.kind === "highlight") removeHighlight(highlights.find((h) => h.id === item.id)!);
                    else removeNote(notes.find((n) => n.id === item.id)!);
                  }} />
              </li>
            ))}
          </ul>
        )}
      </Sheet>

      <Sheet open={sheet === "look"} title={t("Appearance")} onClose={() => setSheet(null)} peek>
        <fieldset class="seg">
          <legend>{t("Page")}</legend>
          {STYLES.map(([value, label]) => (
            <label><input type="radio" name="ebook-style" checked={style === value} onChange={() => saveSetting("pageStyle", value)} />{t(label)}</label>
          ))}
        </fieldset>
        <div class="ebook-font">
          <span>{t("Text size")}</span>
          <IconButton label={t("Smaller text")} icon="minus" disabled={fontSize <= FONT_STEPS[0]}
            onClick={() => saveSetting("ebookFontSize", [...FONT_STEPS].reverse().find((s) => s < fontSize) ?? FONT_STEPS[0])} />
          <output dir="ltr">{fontSize}%</output>
          <IconButton label={t("Larger text")} icon="plus" disabled={fontSize >= FONT_STEPS.at(-1)!}
            onClick={() => saveSetting("ebookFontSize", FONT_STEPS.find((s) => s > fontSize) ?? FONT_STEPS.at(-1)!)} />
        </div>
        <fieldset class="seg">
          <legend>{t("Layout")}</legend>
          <label><input type="radio" name="ebook-flow" checked={flow === "paginated"} onChange={() => saveSetting("ebookFlow", "paginated")} />{t("Page by page")}</label>
          <label><input type="radio" name="ebook-flow" checked={flow === "scrolled"} onChange={() => saveSetting("ebookFlow", "scrolled")} />{t("Scrolling")}</label>
        </fieldset>
      </Sheet>
    </div>
  );
}
