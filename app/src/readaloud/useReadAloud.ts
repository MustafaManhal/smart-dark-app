import { useEffect, useRef, useState } from "preact/hooks";
import { normalizeRects, rectToCss } from "../annotations/geometry";
import { currentChapter } from "../reader/chapters";
import type { OutlineItem } from "../reader/pdf";
import type { Renderer } from "../reader/renderer";
import { saveSetting, settings } from "../settings";
import { loadNatural, NATURAL_PREFIX, naturalId, naturalSupported, unloadNatural } from "./neural";
import { pageLines, rangeFor, readPageText, type PageText } from "./pageText";
import { blankSkipped, skippedLines, speechText, type EdgeMemory } from "./smart";
import { loadVoices, Speaker, stopPreview, type SpeakerState, type Voice } from "./speaker";
import { detectLanguage, splitSentences, type Sentence } from "./text";
import { bestVoice } from "./voices";

export type SleepTimer = { kind: "off" } | { kind: "minutes"; minutes: number; until: number } | { kind: "chapter"; endPage: number };

/** iOS only lets speech start inside a tap; speaking one silent utterance in the tap unlocks it. */
function unlockSpeech() {
  const synth = globalThis.speechSynthesis;
  if (!synth || synth.speaking) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth.speak(u);
}

export function useReadAloud(renderer: { current: Renderer | null }, outline: OutlineItem[], pageCount: number) {
  const [state, setState] = useState<SpeakerState>("idle");
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [lang, setLang] = useState("en");
  const [sleep, setSleep] = useState<SleepTimer>({ kind: "off" });
  const [notice, setNotice] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const edges = useRef<EdgeMemory>(new Map()); // headers and footers seen so far in this book
  const [unsupported] = useState(() => !globalThis.speechSynthesis);
  const page = useRef(1);
  const text = useRef<PageText | null>(null);
  const sentences = useRef<Sentence[]>([]);
  const speaker = useRef<Speaker | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const clearMark = () => renderer.current?.layers(page.current)?.speech.replaceChildren();

  function mark(index: number) {
    const r = renderer.current;
    const s = sentences.current[index];
    const layers = r?.layers(page.current);
    if (!r || !s || !layers || !text.current) return;
    layers.speech.replaceChildren();
    const range = rangeFor(text.current, s.start, s.end);
    if (!range) return;
    const rects = normalizeRects([...range.getClientRects()], layers.page.getBoundingClientRect());
    for (const rect of rects) {
      const div = document.createElement("div");
      div.className = "spoken";
      Object.assign(div.style, rectToCss(rect));
      layers.speech.append(div);
    }
    const first = layers.speech.firstElementChild?.getBoundingClientRect();
    if (first) r.reveal(first);
  }

  if (!speaker.current) {
    speaker.current = new Speaker({
      onSentence: (i) => mark(i),
      onState: setState,
      onWaiting: setWaiting,
      onFallback: () => setNotice("The natural voice could not start. Reading with a device voice."),
    });
  }

  // Ask the voices once.
  useEffect(() => {
    loadVoices().then(setVoices);
  }, []);

  // Keep the screen on while reading aloud (released automatically when hidden).
  useEffect(() => {
    let cancelled = false;
    const acquire = async () => {
      if (state !== "playing" || document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock?.request("screen");
        if (cancelled) lock?.release();
        else wakeLock.current = lock ?? null;
      } catch {}
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, [state]);

  // Sleep timer by minutes.
  useEffect(() => {
    if (sleep.kind !== "minutes") return;
    const t = setTimeout(() => {
      speaker.current?.pause();
      setSleep({ kind: "off" });
      setNotice("Sleep timer ended");
    }, Math.max(0, sleep.until - Date.now()));
    return () => clearTimeout(t);
  }, [sleep]);

  // Stop when leaving the reader, and give back the memory of the natural voices.
  useEffect(() => () => {
    speaker.current?.stop();
    stopPreview();
    unloadNatural();
  }, []);

  /** The chosen voice for a language. A natural voice only counts where they can run. */
  const voiceFor = (language: string) => {
    const chosen = settings.readVoices.value[language] ?? null;
    return naturalId(chosen) && !naturalSupported() ? null : chosen;
  };
  const options = (language = lang) => {
    // With no choice (or when a natural voice fails) the best device voice reads, not the system default.
    speaker.current!.fallbackVoiceURI = bestVoice(voices, language, navigator.language)?.uri ?? null;
    return { rate: settings.readRate.value, pitch: settings.readPitch.value, voiceURI: voiceFor(language), lang: language };
  };

  async function loadPage(n: number) {
    const layer = await renderer.current?.textLayerOf(n);
    text.current = layer ? readPageText(layer) : { text: "", pieces: [] };
    page.current = n;
    let source = text.current.text;
    const smart = settings.readSmart.value;
    if (smart && layer) {
      // Page numbers, running headers and the like are blanked, so sentence positions stay true.
      const lines = pageLines(text.current, layer);
      source = blankSkipped(source, lines, skippedLines(lines, n, edges.current));
    }
    const detected = detectLanguage(source, lang);
    setLang(detected);
    sentences.current = splitSentences(source, detected)
      .map((s) => (smart ? { ...s, say: speechText(s.text, detected) } : s))
      .filter((s) => s.say !== "");
    return detected;
  }

  /** First sentence at or below the top of the visible area on this page. */
  function firstVisibleSentence() {
    const r = renderer.current;
    const layers = r?.layers(page.current);
    if (!r || !layers || !text.current) return 0;
    const top = r.visibleTop() + 8;
    const i = sentences.current.findIndex((s) => {
      const box = rangeFor(text.current!, s.start, s.end)?.getBoundingClientRect();
      return box && box.bottom > top;
    });
    return Math.max(0, i);
  }

  async function startFrom(n: number, at: "visible" | "start") {
    let current = n;
    while (current <= pageCount) {
      const detected = await loadPage(current);
      if (sentences.current.length) {
        const from = at === "visible" ? firstVisibleSentence() : 0;
        speaker.current!.play(sentences.current, from, options(detected));
        return;
      }
      if (!settings.readAutoPage.value) break;
      current++; // nothing to read on this page (e.g. a picture): try the next one
      at = "start";
    }
    speaker.current!.stop();
  }

  // When a page is finished: next page, or stop (end of book, end of chapter timer).
  speaker.current.onQueueEnd = () => {
    clearMark();
    const next = page.current + 1;
    if (sleep.kind === "chapter" && next > sleep.endPage) {
      setSleep({ kind: "off" });
      setNotice("Stopped at the end of the chapter");
      return;
    }
    if (settings.readAutoPage.value && next <= pageCount) {
      renderer.current?.scrollToPage(next);
      startFrom(next, "start");
    }
  };

  return {
    state,
    open,
    voices,
    lang,
    sleep,
    notice,
    waiting,
    unsupported,
    show() {
      setOpen(true);
    },
    /** Call from a tap. */
    toggle(currentPage: number) {
      unlockSpeech();
      setNotice(null);
      const s = speaker.current!;
      if (s.state === "playing") s.pause();
      else if (s.state === "paused" && page.current === currentPage) s.resume();
      else startFrom(currentPage, "visible");
    },
    skip(delta: number) {
      speaker.current?.skip(delta);
    },
    close() {
      stopPreview();
      speaker.current?.stop();
      clearMark();
      setOpen(false);
      setSleep({ kind: "off" });
      setNotice(null);
    },
    applyOptions() {
      speaker.current?.setOptions(options());
    },
    pause() {
      speaker.current?.pause();
    },
    /** Downloads the natural voices (once) and starts using the first one for English. */
    async downloadNatural() {
      try {
        await loadNatural();
      } catch {
        return; // the picker shows the error and a way to try again
      }
      saveSetting("naturalDownloaded", true);
      if (!naturalId(settings.readVoices.value.en)) {
        saveSetting("readVoices", { ...settings.readVoices.value, en: `${NATURAL_PREFIX}af_heart` });
        speaker.current?.setOptions(options());
      }
    },
    setSleep(kind: "off" | 15 | 30 | 60 | "chapter", currentPage: number) {
      if (kind === "off") setSleep({ kind: "off" });
      else if (kind === "chapter") {
        const ch = currentChapter(outline, page.current || currentPage, pageCount);
        setSleep({ kind: "chapter", endPage: ch ? ch.endPage : pageCount });
      } else setSleep({ kind: "minutes", minutes: kind, until: Date.now() + kind * 60_000 });
    },
  };
}
