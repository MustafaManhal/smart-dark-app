import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { Button } from "../ui/Button";

// Each step points at one tool of the top bar (found by its place among the tools, which no language changes).
const STEPS: { target: string; title: string; text: string }[] = [
  { target: ".tools .icon-btn:nth-child(8)", title: "Dark pages, real colors",
    text: "Photos and colored text keep their look. Appearance changes the page style and fine-tunes it." },
  { target: ".tools .icon-btn:nth-child(1)", title: "Mark what matters",
    text: "Select text to highlight it or to write a note. What you mark is collected under Notes." },
  { target: ".tools .icon-btn:nth-child(5)", title: "Listen to the book",
    text: "Read aloud speaks the text and follows it on the page." },
];

/** Three short steps shown with the sample book. The reader stays usable under it. */
export function Tour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const { target, title, text } = STEPS[step];

  // The step sits under its tool, inside the screen, with a ring around the tool.
  useLayoutEffect(() => {
    const tool = document.querySelector<HTMLElement>(target);
    const el = box.current;
    if (!tool || !el) return;
    const place = () => {
      const at = tool.getBoundingClientRect();
      const width = el.offsetWidth;
      const left = Math.min(innerWidth - width - 12, Math.max(12, at.left + at.width / 2 - width / 2));
      el.style.top = `${at.bottom + 12}px`;
      el.style.left = `${left}px`;
      el.style.setProperty("--arrow", `${Math.min(width - 22, Math.max(22, at.left + at.width / 2 - left))}px`);
    };
    place();
    tool.classList.add("tour-target");
    addEventListener("resize", place);
    return () => {
      tool.classList.remove("tour-target");
      removeEventListener("resize", place);
    };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const last = step === STEPS.length - 1;
  return (
    <div class="tour" ref={box} role="dialog" aria-label={t("Quick tour")}>
      <strong>{t(title)}</strong>
      <p>{t(text)}</p>
      <div class="tour-foot">
        <span class="tour-count" dir="ltr" aria-label={t("Step {n} of {total}", { n: step + 1, total: STEPS.length })}>
          {STEPS.map((_, i) => <i class={i === step ? "is-on" : ""} />)}
        </span>
        {!last && <Button onClick={onDone}>{t("Skip")}</Button>}
        <Button variant="primary" onClick={() => (last ? onDone() : setStep(step + 1))}>{t(last ? "Done" : "Next")}</Button>
      </div>
    </div>
  );
}

/** For the translation test: these reach t() through variables. */
export const TOUR_STRINGS = STEPS.flatMap((s) => [s.title, s.text]);
