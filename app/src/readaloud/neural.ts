import { signal } from "@preact/signals";

/**
 * Natural voices: the Kokoro speech model run on this device by the HeadTTS
 * worker (app/public/tts/, see scripts/copy-tts-assets.mjs). English only.
 * Every script is served by the app itself; the model (about 326 MB) comes from
 * Hugging Face the first time and is then kept by the browser.
 *
 * Measured on a 10-core Mac, seconds of computing per second of speech: the
 * full-precision model 0.45 on the processor with threads and 0.35 on the
 * graphics card; the 8-bit model (92 MB) 0.9 with threads and 1.9 without,
 * too slow to keep up; the half-precision model sometimes returns silence.
 */

export type NaturalVoice = { id: string; name: string; accent: "American" | "British"; gender: "female" | "male" };

const voice = (id: string): NaturalVoice => ({
  id,
  name: id.slice(3, 4).toUpperCase() + id.slice(4),
  accent: id[0] === "a" ? "American" : "British",
  gender: id[1] === "f" ? "female" : "male",
});

/** The 28 English voices, the ones that read best first. */
export const NATURAL_VOICES: NaturalVoice[] = [
  "af_heart", "af_bella", "af_nicole", "af_aoede", "af_kore", "af_sarah", "af_nova", "af_sky", "af_alloy", "af_jessica", "af_river",
  "am_michael", "am_fenrir", "am_puck", "am_echo", "am_eric", "am_liam", "am_onyx", "am_adam", "am_santa",
  "bf_emma", "bf_isabella", "bf_alice", "bf_lily",
  "bm_george", "bm_fable", "bm_lewis", "bm_daniel",
].map(voice);

/** Settings store a natural voice as "natural:af_heart", next to the system voices' URIs. */
export const NATURAL_PREFIX = "natural:";
export const naturalId = (uri: string | null | undefined) =>
  uri?.startsWith(NATURAL_PREFIX) && NATURAL_VOICES.some((v) => v.id === uri.slice(NATURAL_PREFIX.length))
    ? uri.slice(NATURAL_PREFIX.length) : null;

export const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX-timestamped";
export const MODEL_MB = 326;
const HF_VOICES = "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";

/**
 * Computers only. On phones and tablets the model does not fit in the memory a
 * browser tab gets (iPhone Safari is known to crash on it), so they keep the
 * device voices.
 */
export function naturalSupported() {
  if (typeof navigator === "undefined" || typeof Worker === "undefined" || typeof WebAssembly === "undefined") return false;
  if (typeof AudioContext === "undefined" && !("webkitAudioContext" in globalThis)) return false;
  const ua = navigator.userAgent;
  const touchMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPad asking for desktop sites
  return !/iPhone|iPad|iPod|Android|Mobile/i.test(ua) && !touchMac;
}

export type NaturalStatus = "off" | "loading" | "ready" | "error";
/** off: not loaded in this session. */
export const naturalStatus = signal<NaturalStatus>("off");
/** Download or load progress, 0..1. */
export const naturalProgress = signal(0);

type Pending = { resolve: (audio: ArrayBuffer) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let loading: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

const asset = (path: string) => new URL(`tts/${path}`, document.baseURI).href;

function fail(error: Error) {
  for (const p of pending.values()) p.reject(error);
  pending.clear();
  worker?.terminate();
  worker = null;
  loading = null;
  naturalStatus.value = "error";
}

/** Starts the worker and loads the model (downloading it the first time). Safe to call again. */
export function loadNatural(): Promise<void> {
  if (loading) return loading;
  naturalStatus.value = "loading";
  naturalProgress.value = 0;
  loading = (async () => {
    // Voices are shipped with the app; a build without them reads them from Hugging Face.
    const local: string[] = await fetch(asset("voices/index.json")).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    // Tests point the engine at a local copy of the model.
    const host = (globalThis as { __smartDarkModelHost?: string }).__smartDarkModelHost;
    const w = new Worker(asset("headtts/worker-tts.mjs") + (host ? `?modelHost=${encodeURIComponent(host)}` : ""), { type: "module" });
    worker = w;
    await new Promise<void>((resolve, reject) => {
      // A failed load inside the worker sends nothing back, so silence counts as failure.
      let quiet = 0;
      const watch = () => {
        clearTimeout(quiet);
        quiet = window.setTimeout(() => reject(new Error("The voice engine did not answer.")), 90_000);
      };
      const done = (finish: () => void) => {
        clearTimeout(quiet);
        finish();
      };
      watch();
      w.onerror = (e) => done(() => reject(new Error(e.message || "The voice engine could not start.")));
      w.onmessage = (ev) => {
        const m = ev.data;
        if (m?.type === "progress") {
          watch();
          if (m.data?.total > 0) naturalProgress.value = Math.min(1, m.data.loaded / m.data.total);
        } else if (m?.type === "ready") done(resolve);
        else if (m?.type === "error") done(() => reject(new Error(m.data?.error ?? "The voice engine could not start.")));
      };
      w.postMessage({
        type: "connect",
        data: {
          transformersModule: asset("transformers-local.mjs"),
          model: MODEL,
          // Threads need a cross-origin isolated page (COOP and COEP headers). Where a browser
          // does not grant that (Safari), the graphics card is the fast path.
          device: !globalThis.crossOriginIsolated && "gpu" in navigator ? "webgpu" : "wasm",
          dtype: "fp32",
          styleDim: 256,
          frameRate: 40,
          audioSampleRate: 24000,
          languages: ["en-us"],
          dictionaryURL: asset("dictionaries"),
          voiceURL: local.length ? asset("voices") : HF_VOICES,
          voices: [],
          deltaStart: -10,
          deltaEnd: 10,
          trace: 0,
        },
      });
    });
    w.onerror = (e) => fail(new Error(e.message || "The voice engine stopped."));
    w.onmessage = (ev) => {
      const m = ev.data;
      const p = pending.get(m?.ref);
      if (!p) return;
      pending.delete(m.ref);
      if (m.type === "audio" && m.data?.audio instanceof ArrayBuffer) p.resolve(m.data.audio);
      else p.reject(new Error(m.data?.error ?? "This sentence could not be spoken."));
    };
    naturalProgress.value = 1;
    naturalStatus.value = "ready";
  })();
  loading.catch((error) => fail(error instanceof Error ? error : new Error(String(error))));
  return loading;
}

/** One sentence as a WAV file (24 kHz, mono). `speed` 1 is the voice's own pace. */
export async function synthesize(text: string, voiceId: string, speed: number): Promise<ArrayBuffer> {
  await loadNatural();
  const w = worker;
  if (!w) throw new Error("The voice engine is not running.");
  const id = nextId++;
  return new Promise<ArrayBuffer>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({
      type: "synthesize",
      id,
      data: { input: text, voice: voiceId, language: "en-us", speed: Math.min(4, Math.max(0.25, speed)), audioEncoding: "wav" },
    });
  });
}

/** Frees the model's memory (about 1 GB while loaded). */
export function unloadNatural() {
  for (const p of pending.values()) p.reject(new Error("Stopped."));
  pending.clear();
  worker?.terminate();
  worker = null;
  loading = null;
  naturalStatus.value = "off";
}
