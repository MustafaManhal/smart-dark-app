# Plan 3: Read aloud (done)

**Research (2026-10-03):** Chrome stops long utterances after ~15 s (crbug 41346274, still open), so text
is spoken one sentence per utterance and chained on `end`. Pause is a cancel on Android, so the app keeps
its own position and restarts the current sentence. `boundary` events differ per browser, so highlighting
uses our own sentence ranges. iOS requires a tap to start speech: a silent utterance is spoken inside the
tap. Voices load asynchronously (`onvoiceschanged`), identified by `voiceURI`. `Intl.Segmenter` sentence
granularity: Safari 14.1+, handles Arabic ؟ and ۔.

**Built:**
- `readaloud/text.ts`: paragraph-aware sentence splitting (short lines like headings and captions are
  their own sentences), long sentences cut at ≤ 220 chars, Arabic/Latin detection.
- `readaloud/pageText.ts`: text of a pdf.js text layer with offsets mapped back to DOM text nodes.
- `readaloud/speaker.ts`: sentence queue over `speechSynthesis` with pause/resume/skip/stop and a
  generation counter that ignores events from cancelled utterances.
- `readaloud/useReadAloud.ts`: starts at the first visible sentence, highlights and follows the spoken
  sentence, continues to the next page, sleep timer (minutes or end of chapter), screen wake lock.
- `readaloud/ReadAloudBar.tsx`: player with previous/next sentence, play/pause, speed, settings
  (voice per language, speed, pitch, sleep timer, continue to next page).

**Tests:** unit (sentence splitting, language, speaker with a fake engine, text mapping) and e2e with a
recording stand-in for `speechSynthesis` on Chromium and WebKit.
