import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Rating } from "ts-fsrs";
import { COLOR_HEX } from "../annotations/colors";
import type { ReviewState } from "../db/reviews";
import type { Repos } from "../db/repos";
import { t } from "../i18n/i18n";
import { notebookItems, type NotebookItem } from "../notebook/items";
import { navigate } from "../router";
import { saveSetting, settings } from "../settings";
import { Button, IconButton } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { answer, buildQueue, comesBack, dayKey, GRADES, reviewStreak, type Answer } from "./schedule";
import "./review.css";

const GRADE_LABEL: Record<Answer, string> = { [Rating.Again]: "Again", [Rating.Hard]: "Hard", [Rating.Good]: "Good", [Rating.Easy]: "Easy" } as Record<Answer, string>;

/** "10 min", "3 h", "4 days": when a mark comes back. */
function when(minutes: number) {
  if (minutes < 60) return t("{n} min", { n: minutes });
  if (minutes < 60 * 24) return t("{n} h", { n: Math.round(minutes / 60) });
  const days = Math.round(minutes / (60 * 24));
  return days === 1 ? t("1 day") : days < 60 ? t("{n} days", { n: days }) : t("{n} months", { n: Math.round(days / 30) });
}

/**
 * The daily review: marks and notes come back as cards, each a little later
 * than the last time when it was remembered, sooner when it was not.
 */
export function ReviewScreen({ repos }: { repos: Repos }) {
  const [items, setItems] = useState<NotebookItem[] | null>(null);
  const [states, setStates] = useState(new Map<string, ReviewState>());
  // The cards of this sitting, in order. A card answered "Again" goes to the end of it.
  const [queue, setQueue] = useState<string[]>([]);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    Promise.all([repos.books.all(), repos.annotations.all(), repos.reviews.all()]).then(([books, marks, reviews]) => {
      const all = notebookItems(marks, books);
      const built = buildQueue(all, reviews, Date.now(), settings.reviewNewPerDay.value);
      setItems(all);
      setStates(new Map(reviews.map((r) => [r.id, r])));
      setQueue([...built.due, ...built.fresh].map((i) => i.id));
      setWaiting(built.waiting);
    });
  }, []);

  const current = useMemo(() => items?.find((i) => i.id === queue[0]) ?? null, [items, queue]);
  const back = current ? comesBack(states.get(current.id), Date.now()) : null;
  // A plain highlight has no hidden side: the passage is the card.
  const hasBack = !!current && current.kind !== "highlight" && !!(current.note.trim() || (current.title.trim() && current.passage.trim()));
  const front = current ? current.passage || current.title || current.note : "";

  async function grade(g: Answer) {
    if (!current) return;
    const now = Date.now();
    const next = answer(current.id, states.get(current.id), g, now);
    await repos.reviews.put(next);
    setStates((map) => new Map(map).set(next.id, next));
    // Not remembered: it comes again before this sitting ends.
    setQueue((q) => (g === Rating.Again ? [...q.slice(1), q[0]] : q.slice(1)));
    if (g !== Rating.Again) setDone((n) => n + 1);
    setShown(false);
    const today = dayKey(now);
    if (!settings.reviewDays.value.includes(today)) saveSetting("reviewDays", [...settings.reviewDays.value.slice(-400), today]);
  }

  // Space shows the note, 1 to 4 answer. The handler of the latest render runs (an effect would lag a moment behind).
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {});
  onKey.current = (e) => {
    if (!current || e.metaKey || e.ctrlKey || e.altKey || (e.target as Element).closest?.("button, a, input")) return;
    if ((e.key === " " || e.key === "Enter") && hasBack && !shown) {
      e.preventDefault();
      setShown(true);
    } else if (["1", "2", "3", "4"].includes(e.key) && (shown || !hasBack)) grade(GRADES[Number(e.key) - 1]);
  };
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e);
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, []);

  const streak = reviewStreak(settings.reviewDays.value, Date.now());
  return (
    <div class="review">
      <header class="review-head">
        <IconButton label={t("Back to library")} icon="back" onClick={() => navigate({ name: "library" })} />
        <h1>{t("Review")}</h1>
        {queue.length > 0 && <span class="review-left" role="status">{t(queue.length === 1 ? "1 left" : "{n} left", { n: queue.length })}</span>}
      </header>

      {items && !current && (
        <section class="review-done">
          <div class="lib-empty-art"><Icon name={done || streak ? "star" : "notes"} size={40} /></div>
          {items.length === 0 ? (
            <>
              <h2>{t("Nothing to review yet")}</h2>
              <p>{t("Highlight a passage or write a note in a book. It will come back here, so that you remember it.")}</p>
            </>
          ) : (
            <>
              <h2>{t(done ? "Done for today" : "Nothing is due now")}</h2>
              {done > 0 && <p>{t(done === 1 ? "1 mark reviewed." : "{n} marks reviewed.", { n: done })}</p>}
              {streak > 0 && <p class="review-streak">{t(streak === 1 ? "Review streak: 1 day" : "Review streak: {n} days", { n: streak })}</p>}
              {waiting > 0 && <p class="review-note">{t(waiting === 1 ? "1 more mark is waiting for its day." : "{n} more marks are waiting for their day.", { n: waiting })}</p>}
            </>
          )}
          <Button variant="primary" onClick={() => navigate({ name: "library" })}>{t("Back to library")}</Button>
        </section>
      )}

      {current && back && (
        <article class="review-card" aria-label={t("Card")} style={current.color ? { "--c": COLOR_HEX[current.color] } : undefined}>
          <p class="review-source">
            <span>{current.bookTitle} · {t("Page {page}", { page: current.page })}</span>
            <button type="button" class="link" onClick={() => navigate({ name: "reader", bookId: current.bookId, page: current.page })}>{t("Open in the book")}</button>
          </p>
          <blockquote class="review-front" dir="auto">{front}</blockquote>
          {hasBack && !shown && (
            <Button variant="primary" onClick={() => setShown(true)}>{t("Show my note")}</Button>
          )}
          {hasBack && shown && (
            <div class="review-back" dir="auto">
              {current.passage && current.title && <strong>{current.title}</strong>}
              {current.note && (current.passage || current.title) && <p>{current.note}</p>}
            </div>
          )}
          {(shown || !hasBack) && (
            <div class="review-grades" role="group" aria-label={t("How well did you remember it?")}>
              <p>{t("How well did you remember it?")}</p>
              {GRADES.map((g, i) => (
                <button type="button" class={`grade is-${GRADE_LABEL[g].toLowerCase()}`} onClick={() => grade(g)}>
                  <strong>{t(GRADE_LABEL[g])}</strong>
                  <small>{when(back[g].minutes)}</small>
                  <kbd aria-hidden="true">{i + 1}</kbd>
                </button>
              ))}
            </div>
          )}
        </article>
      )}
    </div>
  );
}

/** For the translation test: these reach t() through variables. */
export const REVIEW_STRINGS = Object.values(GRADE_LABEL);
