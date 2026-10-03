# Plan 5: Settings, English + Arabic, book details (done)

**Research (2026-10-03):** Open Library search and covers send `Access-Control-Allow-Origin: *`, so a
web app can call them directly; `?default=false` makes missing covers a 404. Google Books also allows
CORS but keyless calls returned 429 (rate limited) during testing, so it is a second source that may fail.

**Built:**
- `i18n/`: `t()` keyed by English text with `{placeholders}`, Arabic dictionary, language setting
  (device/English/Arabic), `lang`/`dir` on `<html>`, Western digits in Arabic to match PDF page numbers.
  A unit test scans the source so every UI string has an Arabic translation with the same placeholders.
- Right-to-left: logical CSS properties, mirrored direction icons, panel and progress bar on the reading
  side, pages and charts stay left to right.
- Settings screen: app theme, default page style and dark theme, image handling, language, read-aloud
  defaults, links to goals and backup, opt-in online lookup, about.
- Book details sheet: edit title/author; with opt-in, search Open Library + Google Books, pick a match,
  cover downloaded and stored. Nothing is sent before the user turns lookup on.

**Fixed while testing:** a race where the details form overwrote typed text after its first paint.
