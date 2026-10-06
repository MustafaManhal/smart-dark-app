# Read aloud: natural voices, smart reading, finer speed (done)

Asked for by the owner on 2026-10-06: voices that do not sound like a robot, many of them, reading that
knows what to skip, and speed in steps of 0.25.

**Research (2026-10-06 and 07):**

- Device voices (Web Speech) depend on the device. Web apps on iPhone cannot use Siri voices; Apple keeps
  them from third-party use (speechcentral.net, 2026-08-08).
- Kokoro (82M parameters, Apache-2.0) has 28 English voices and runs in a browser through ONNX Runtime Web.
  It has no Arabic. Model files on Hugging Face (`onnx-community/Kokoro-82M-v1.0-ONNX-timestamped`): 326 MB
  full precision, 163 MB half precision, 92 MB 8-bit.
- The usual wrapper, `kokoro-js`, pronounces words with eSpeak NG, which is GPL-3. That does not fit this
  project's MIT license. HeadTTS (`@met4citizen/headtts`, MIT) runs the same model with its own
  pronunciation: the CMU dictionary (BSD) plus rules. It is used here.
- Piper has Arabic voices but needs eSpeak NG too.
- Kokoro in iPhone Safari is reported to crash: about 760 MB peak memory, and a memory bug in the ONNX
  Runtime builds on iOS 26.2 and later (sudotman/hear PR 1).
- Cloud voices sound best everywhere but cost money per character and send the book text away.

**Decision (owner):** natural voices on computers, the best device voice on phones and for Arabic.

**Measured on a 10-core Mac** (seconds of computing for one second of speech, lower is better):

| Model | Where | Result |
|---|---|---|
| 8-bit, 92 MB | processor, one thread | 1.9, cannot keep up |
| 8-bit, 92 MB | processor, 8 threads | 0.9, too close |
| half precision, 163 MB | processor, 8 threads | 0.4 to 0.7, but one sentence came out silent |
| full precision, 326 MB | processor, 8 threads | 0.45 |
| full precision, 326 MB | graphics card (Electron) | 0.35 |

So the app uses the full-precision model. The download is 326 MB, not the 92 MB first planned.

**Built:**

- The HeadTTS worker and dictionary are kept in `vendor/headtts/` (unchanged copies of version 1.3.0). The
  npm package has an install script that does not run on Windows, where the desktop app is built.
- `scripts/copy-tts-assets.mjs` puts the HeadTTS worker, its dictionary, transformers.js, the ONNX Runtime
  wasm and the 28 voice files into `app/public/tts/` (58 MB, kept out of git and out of the offline
  precache; cached on first use). The app loads no script from another site. Only the model weights come
  from Hugging Face, once, and the browser keeps them.
- `app/src/readaloud/neural.ts` talks to the HeadTTS worker directly. It uses threads when the page is
  cross-origin isolated and the graphics card when it is not (Safari does not grant isolation with these
  headers). `vercel.json` and `desktop/main.mjs` now send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: credentialless`, and allow `huggingface.co` and `*.hf.co` in `connect-src`.
- `Speaker` plays natural voices through Web Audio. It prepares the next two sentences while one plays. If
  the natural voice fails, reading goes on with the best device voice and says so.
- `voices.ts` ranks device voices by name: natural, premium, Siri and enhanced voices first, the old robotic
  and novelty voices last. With no choice made, the best one reads, not the system default.
- The read-aloud sheet lists every voice for the language with a button to hear it. On a computer reading
  English it offers the download first, then the 28 natural voices.
- `smart.ts`: lines that are page numbers, running headers and footers (seen on an earlier page), bare
  links, chart labels or rows of figures are not read. Sentences lose citation marks like `[12]`,
  footnote numbers and dot leaders; links are said as "link"; `e.g.`, `i.e.`, `Fig.` and similar are said
  in full. A switch turns this off.
- Speed goes from 0.25× to 3× in steps of 0.25, with minus and plus buttons in the bar, the sheet and
  Settings.

**Limits:**

- Natural voices are English only and for computers only. Phones, tablets and Arabic use device voices.
- A slow computer cannot make speech as fast as it is spoken. The bar then shows "Preparing the voice…"
  between sentences. Nothing measures this ahead of time.
- Safari on a Mac takes the graphics-card path, which was not tested (no Safari with WebGPU in the test
  tools). Chromium and the desktop app were tested with real speech.
- A running header is read on the first page it appears on, because it is only known as a header once it
  repeats.
- Supertonic 3 (MIT code, OpenRAIL-M model, 31 languages with Arabic, about 404 MB) would give Arabic a
  natural voice the same way. Not built.

**Tests:** unit tests for the smart rules, voice ranking and natural playback with a stand-in model
(`smart-reading.test.ts`, `natural-voice.test.ts`); browser tests for speed, smart reading, the voice list
and, in Chromium, real speech from the model; one desktop test with real speech. The two real-speech tests
need the model at `node_modules/.cache/smart-dark-tts/model/` and skip themselves without it. To fetch it:

```sh
mkdir -p node_modules/.cache/smart-dark-tts/model/onnx && cd node_modules/.cache/smart-dark-tts/model
base=https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/resolve/main
for f in config.json tokenizer.json tokenizer_config.json onnx/model.onnx; do curl -L -o $f $base/$f; done
```
