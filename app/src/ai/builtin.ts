/**
 * Summaries, explanations and translations made by the model that is built
 * into the browser (Chrome and Edge on computers: the Summarizer, Translator
 * and Prompt APIs). The text is worked on by that model on this device; the
 * app sends it nowhere. Where the browser has no such model, these features
 * do not show at all.
 */

type Availability = "unavailable" | "downloadable" | "downloading" | "available";
type Monitor = { addEventListener(type: "downloadprogress", listener: (e: { loaded: number }) => void): void };
type Created = { monitor?: (m: Monitor) => void };
type Api<Options, Instance> = { availability(options?: Options): Promise<Availability>; create(options?: Options & Created): Promise<Instance> };
type Destroyable = { destroy?: () => void };

declare const Summarizer: Api<{ type?: string; format?: string; length?: string; outputLanguage?: string }, Destroyable & { summarize(text: string): Promise<string> }>;
declare const Translator: Api<{ sourceLanguage: string; targetLanguage: string }, Destroyable & { translate(text: string): Promise<string> }>;
declare const LanguageDetector: Api<object, Destroyable & { detect(text: string): Promise<{ detectedLanguage: string; confidence: number }[]> }>;
declare const LanguageModel: Api<{ initialPrompts?: { role: string; content: string }[] }, Destroyable & { prompt(text: string): Promise<string> }>;

const has = (name: string) => name in globalThis;

/** What this browser has an API for. Whether its model can run on this computer is asked by `checkAi`. */
export const aiSupport = () => ({ summarize: has("Summarizer"), translate: has("Translator"), explain: has("LanguageModel") });
export const anyAi = () => Object.values(aiSupport()).some(Boolean);

/**
 * What the browser's model can really do here. A browser can have the APIs
 * and still say "unavailable" (too little memory, an unsupported system):
 * then the feature stays hidden.
 */
export async function checkAi() {
  const able = async (name: string, ask: () => Promise<Availability>) => has(name) && (await ask().catch(() => "unavailable")) !== "unavailable";
  const [summarize, translate, explain] = await Promise.all([
    able("Summarizer", () => Summarizer.availability({ type: "key-points", format: "plain-text", length: "medium" })),
    able("Translator", () => Translator.availability({ sourceLanguage: "en", targetLanguage: "ar" })),
    able("LanguageModel", () => LanguageModel.availability()),
  ]);
  return { summarize, translate, explain };
}

export class AiUnavailable extends Error {}
/** The text is already in the language asked for. */
export class SameLanguage extends Error {}

/** `onLoad` reports the browser fetching its model, 0 to 1 (only the first time it is needed). */
type Progress = (loaded: number) => void;
const watching = (onLoad?: Progress): Created => ({
  monitor(m) {
    m.addEventListener("downloadprogress", (e) => onLoad?.(e.loaded));
  },
});

async function ready<O>(api: Api<O, unknown>, options?: O) {
  const state = await api.availability(options);
  if (state === "unavailable") throw new AiUnavailable("The browser's model cannot do this on this computer.");
}

/** Splits a long text at paragraph or sentence ends into pieces the model can take. */
export function pieces(text: string, size = 9000): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const window = rest.slice(0, size);
    const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "), window.lastIndexOf("。")) + 1 || size;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** The main points of a text. A long text is summarized piece by piece, then the pieces together. */
export async function summarize(text: string, onLoad?: Progress, onStep?: (done: number, total: number) => void): Promise<string> {
  const options = { type: "key-points", format: "plain-text", length: "medium" };
  await ready(Summarizer, options);
  const summarizer = await Summarizer.create({ ...options, ...watching(onLoad) });
  try {
    const parts = pieces(text).slice(0, 12);
    if (parts.length === 1) return (await summarizer.summarize(parts[0])).trim();
    const notes: string[] = [];
    for (const [i, part] of parts.entries()) {
      onStep?.(i, parts.length + 1);
      notes.push(await summarizer.summarize(part));
    }
    onStep?.(parts.length, parts.length + 1);
    return (await summarizer.summarize(notes.join("\n"))).trim();
  } finally {
    summarizer.destroy?.();
  }
}

/** The language a text is written in ("en", "ar"), or null when the browser cannot tell. */
export async function detect(text: string): Promise<string | null> {
  if (!has("LanguageDetector")) return null;
  try {
    const detector = await LanguageDetector.create();
    const [best] = await detector.detect(text.slice(0, 600));
    detector.destroy?.();
    return best && best.detectedLanguage !== "und" ? best.detectedLanguage : null;
  } catch {
    return null;
  }
}

export async function translate(text: string, target: string, onLoad?: Progress): Promise<string> {
  const source = (await detect(text)) ?? (/[؀-ۿ]/.test(text) ? "ar" : "en");
  if (source === target) throw new SameLanguage();
  const pair = { sourceLanguage: source, targetLanguage: target };
  await ready(Translator, pair);
  const translator = await Translator.create({ ...pair, ...watching(onLoad) });
  try {
    return (await translator.translate(text)).trim();
  } finally {
    translator.destroy?.();
  }
}

/** A passage put in plain words, for a reader who met it in a book. */
export async function explain(text: string, book: string, onLoad?: Progress): Promise<string> {
  await ready(LanguageModel);
  const model = await LanguageModel.create({
    initialPrompts: [{
      role: "system",
      content: "You help a reader understand a passage from a book. Explain what it says in plain words, in a few short sentences. Explain terms a general reader may not know. Do not add facts that are not in the passage. Answer in the language of the passage.",
    }],
    ...watching(onLoad),
  });
  try {
    return (await model.prompt(`${book ? `Book: ${book}\n\n` : ""}Passage:\n${text}`)).trim();
  } finally {
    model.destroy?.();
  }
}
