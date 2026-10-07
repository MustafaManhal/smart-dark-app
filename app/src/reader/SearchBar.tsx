import { useEffect, useRef, useState } from "preact/hooks";
import { normalizeRects, rectToCss } from "../annotations/geometry";
import { t } from "../i18n/i18n";
import { IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import type { Renderer } from "./renderer";
import type { BookSearch, Match } from "./search";

/**
 * Search state for the open book: what was found, which match is the current
 * one, and the marks drawn on the pages.
 */
export function useBookSearch(search: BookSearch | null, renderer: { current: Renderer | null }, currentPage: number) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [current, setCurrent] = useState(-1);
  const [busy, setBusy] = useState(false);
  const pageNow = useRef(currentPage);
  pageNow.current = currentPage;

  // Run the search a moment after typing stops.
  useEffect(() => {
    if (!open || !search || !query.trim()) {
      setMatches([]);
      setCurrent(-1);
      setBusy(false);
      return;
    }
    setBusy(true);
    let stop = () => {};
    let picked = false;
    const timer = setTimeout(() => {
      stop = search.run(query, (found, _pages, done) => {
        setMatches(found);
        setBusy(!done);
        // Start at the first match on or after the page being read.
        if (!picked && (done || found.some((m) => m.page >= pageNow.current))) {
          picked = true;
          const at = found.findIndex((m) => m.page >= pageNow.current);
          const index = found.length ? (at === -1 ? 0 : at) : -1;
          setCurrent(index);
          if (index !== -1) show(found[index]);
        }
      });
    }, 250);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [open, query, search]);

  function show(match: Match) {
    const r = renderer.current;
    r?.scrollToPage(match.page, Math.max(0, r.offsetFor(match.y) - 0.18));
  }

  function go(index: number) {
    if (!matches.length) return;
    const next = (index + matches.length) % matches.length;
    setCurrent(next);
    show(matches[next]);
  }

  // Draw the matches of a page into its search layer. Positions come from the
  // text layer on screen, so they are exact; a page gets its marks when its
  // text has been laid out.
  const state = useRef({ matches, current, open });
  state.current = { matches, current, open };
  const draw = (page: number) => {
    const r = renderer.current;
    const layers = r?.layers(page);
    if (!r || !layers) return;
    layers.search.replaceChildren();
    const { matches: all, current: now, open: isOpen } = state.current;
    const spans = r.textSpans(page);
    if (!isOpen || !spans) return;
    const box = layers.page.getBoundingClientRect();
    all.forEach((match, index) => {
      if (match.page !== page) return;
      for (const part of match.parts) {
        const node = spans[part.item]?.firstChild;
        if (!(node instanceof Text)) continue;
        const range = document.createRange();
        range.setStart(node, Math.min(part.from, node.data.length));
        range.setEnd(node, Math.min(part.to, node.data.length));
        for (const rect of normalizeRects([...range.getClientRects()], box)) {
          const mark = document.createElement("div");
          mark.className = index === now ? "found is-current" : "found";
          Object.assign(mark.style, rectToCss(rect));
          layers.search.append(mark);
        }
      }
    });
  };

  useEffect(() => {
    const r = renderer.current;
    if (!r) return;
    for (let n = 1; n <= r.pageCount; n++) draw(n);
    r.onTextRendered = draw;
    return () => {
      r.onTextRendered = () => {};
    };
  }, [matches, current, open, search]);

  return {
    open, query, matches, current, busy,
    setQuery,
    show() { setOpen(true); },
    close() { setOpen(false); },
    next() { go(current + 1); },
    previous() { go(current - 1); },
    goTo(index: number) { go(index); },
  };
}

type Controller = ReturnType<typeof useBookSearch>;

/** The search box with its count, previous and next, and the list of results. */
export function SearchBar({ search }: { search: Controller }) {
  const input = useRef<HTMLInputElement>(null);
  const [list, setList] = useState(false);
  useEffect(() => {
    if (search.open) {
      input.current?.focus();
      input.current?.select();
    } else setList(false);
  }, [search.open]);
  // Keep the current result in view inside the list.
  const listEl = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listEl.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
  }, [search.current, list]);
  if (!search.open) return null;

  const total = search.matches.length;
  const status = !search.query.trim() ? ""
    : total ? t("{n} of {total}", { n: search.current + 1, total })
    : search.busy ? t("Searching…") : t("No matches");

  return (
    <div class="search-bar" role="search" aria-label={t("Search in book")}>
      <div class="search-row">
        <Icon name="search" size={18} />
        <input ref={input} type="search" dir="auto" enterkeyhint="search" autocomplete="off" spellcheck={false}
          aria-label={t("Search in book")} placeholder={t("Search this book")} value={search.query}
          onInput={(e) => search.setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) search.previous();
              else search.next();
            } else if (e.key === "Escape") {
              e.stopPropagation();
              search.close();
            }
          }} />
        <span class="search-count" role="status" dir="ltr">{status}</span>
        <IconButton label={t("Previous match")} icon="collapse" disabled={!total} onClick={search.previous} />
        <IconButton label={t("Next match")} icon="expand" disabled={!total} onClick={search.next} />
        <IconButton label={t("List of matches")} icon="list" class={list ? "is-on" : ""} aria-pressed={list}
          disabled={!total} onClick={() => setList((v) => !v)} />
        <IconButton label={t("Close search")} icon="close" onClick={search.close} />
      </div>
      {list && total > 0 && (
        <ol ref={listEl} class="search-results" aria-label={t("Matches")}>
          {search.matches.map((m, i) => (
            <li>
              <button type="button" aria-current={i === search.current ? "true" : undefined} onClick={() => search.goTo(i)}>
                <span class="search-page">{t("Page {page}", { page: m.page })}</span>
                <span class="search-snippet" dir="auto">{m.before}<mark>{m.hit}</mark>{m.after}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
