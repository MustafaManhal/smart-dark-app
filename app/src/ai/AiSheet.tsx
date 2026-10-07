import { useEffect, useState } from "preact/hooks";
import { lang, t } from "../i18n/i18n";
import { copyText } from "../platform/clipboard";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { AiUnavailable, explain, SameLanguage, summarize, translate } from "./builtin";

export type AiTask = "summarize" | "explain" | "translate";
export type AiRequest = { text: string; book: string; tasks: AiTask[]; heading?: string };

const TASK_LABEL: Record<AiTask, string> = { summarize: "Summarize", explain: "Explain", translate: "Translate" };
const LANGUAGES: [string, string][] = [["en", "English"], ["ar", "العربية"], ["fr", "Français"], ["es", "Español"], ["de", "Deutsch"], ["tr", "Türkçe"], ["ja", "日本語"]];

/**
 * A summary, an explanation or a translation of a piece of the book, made by
 * the browser's own model on this device.
 */
export function AiSheet({ request, support, onClose }: {
  request: AiRequest | null; support: { summarize: boolean; translate: boolean; explain: boolean }; onClose: () => void;
}) {
  const tasks = (request?.tasks ?? []).filter((task) => support[task]);
  const [task, setTask] = useState<AiTask | null>(null);
  // Into the reader's language, or out of it when the text is already in it (Arabic text into English).
  const [target, setTarget] = useState<string>(lang.value);
  const [state, setState] = useState<{ status: "idle" } | { status: "working"; note: string } | { status: "done"; text: string } | { status: "failed"; text: string }>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setTask(null);
    setState({ status: "idle" });
    setCopied(false);
    if (request) setTarget(/[؀-ۿ]/.test(request.text) ? "en" : lang.value === "ar" ? "ar" : "ar");
  }, [request]);

  async function run(which: AiTask, to = target) {
    if (!request) return;
    setTask(which);
    setCopied(false);
    setState({ status: "working", note: t("Working on it…") });
    // The first time, the browser fetches its model: a large download it does itself.
    const loading = (loaded: number) => loaded < 1 && setState({ status: "working", note: t("The browser is getting its model ready: {n}%", { n: Math.round(loaded * 100) }) });
    try {
      const text = which === "summarize"
        ? await summarize(request.text, loading, (done, total) => setState({ status: "working", note: t("Reading part {n} of {total}…", { n: done + 1, total }) }))
        : which === "translate" ? await translate(request.text, to, loading)
        : await explain(request.text, request.book, loading);
      setState({ status: "done", text });
    } catch (error) {
      setState({ status: "failed", text: t(error instanceof SameLanguage ? "The text is already in that language. Pick another one."
        : error instanceof AiUnavailable ? "The browser's model cannot do this on this computer." : "The browser's model could not finish. Try again.") });
    }
  }

  return (
    <Sheet open={!!request} title={request?.heading ?? t("Ask the browser's model")} onClose={onClose}>
      {request && (
        <div class="ai-sheet">
          <blockquote class="ai-source" dir="auto">{request.text.length > 320 ? `${request.text.slice(0, 320).trimEnd()}…` : request.text}</blockquote>
          <div class="ai-tasks" role="group" aria-label={t("What to do")}>
            {tasks.map((which) => (
              <Button variant={task === which ? "primary" : "ghost"} disabled={state.status === "working"} onClick={() => run(which)}>{t(TASK_LABEL[which])}</Button>
            ))}
            {tasks.includes("translate") && (
              <label class="sort">
                {t("Into")}
                <select value={target} disabled={state.status === "working"}
                  onChange={(e) => { const to = e.currentTarget.value; setTarget(to); if (task === "translate") run("translate", to); }}>
                  {LANGUAGES.map(([code, name]) => <option value={code}>{name}</option>)}
                </select>
              </label>
            )}
          </div>
          {state.status === "working" && <p class="ai-note" role="status">{state.note}</p>}
          {state.status === "failed" && <p class="ai-note" role="alert">{state.text}</p>}
          {state.status === "done" && (
            <>
              <div class="ai-answer" role="status" dir="auto">{state.text}</div>
              <div class="sheet-actions">
                <Button onClick={async () => setCopied(await copyText(state.text))}><Icon name="copy" size={18} /> {t(copied ? "Copied" : "Copy")}</Button>
              </div>
            </>
          )}
          <p class="ai-about">{t("Made by the model built into this browser, on this device. The text is not sent anywhere. It can be wrong: check it against the book.")}</p>
        </div>
      )}
    </Sheet>
  );
}

/** For the translation test: these reach t() through variables. */
export const AI_STRINGS = Object.values(TASK_LABEL);
