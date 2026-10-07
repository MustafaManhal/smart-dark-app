# Next level: research and roadmap (approved by the owner 2026-10-07: this order, PDF only, stores later)

Written 2026-10-07. The owner asked for a modern PDF reader that many people use, with every good feature,
under the name Reader343. This document says what the best readers offer, what this app has and lacks, and
in which order to build the rest. Nothing in it is built yet.

## 1. What the app should be

A free reader that is private by design: no account, books stay on the device, and it works offline. It
runs on the web, as an iPhone web app, as a Mac and Windows app and as a browser extension. Three things
already set it apart, and the roadmap keeps them in front:

1. Dark mode that keeps colors and photos. No other reader in the research does this.
2. Natural read-aloud voices that run on the device, free.
3. English and Arabic with right-to-left layout.

The people it fits best: students and researchers who read and mark up PDFs, people who read at night, and
Arabic readers, who are poorly served by most PDF apps.

## 2. The name "Reader343" needs a decision first

Reader343 is an existing Android PDF reader by the GitHub user LAITH343
([repository](https://github.com/LAITH343/Reader343)). It is under active work (version 1.4 on 24
September), and it has no license file. This project's own rule so far has been to take features from it
and never its code, icons or text.

Using the same name for another product is a different step from matching features:

- If the owner is LAITH343, or has LAITH343's agreement, the name is fine and the two apps can be one
  family: Reader343 for Android there, Reader343 for web, iPhone and desktop here.
- If not, taking the name would confuse users of both apps, and the other author could ask stores and
  GitHub to take this app down. A name change after people have installed it is costly.

Renaming also has a technical cost on the desktop: Electron keeps user data in a folder named after the
product, so the desktop app needs a one-time move of that folder or users lose their library.

**The rename is not started until the owner answers this.** Everything else below does not depend on it.

## 3. What the best readers do

| Reader | What reviewers and users single out | Source |
|---|---|---|
| PDF Expert | speed, polish, Apple Pencil, sync between phone and computer | [denser.ai roundup](https://denser.ai/blog/best-pdf-reader/) |
| Xodo | free without watermarks, accounts or upgrade nags; OCR | [onlinepdfedits.com](https://onlinepdfedits.com/blog/best-pdf-annotation-tools) |
| Acrobat Reader | the widest set of markup tools; criticised for upsell pressure | [same](https://onlinepdfedits.com/blog/best-pdf-annotation-tools) |
| Zotero | notes live in a library organised by reference | [myflexnote.com](https://myflexnote.com/blog/best-pdf-annotation-apps) |
| Sioyek | preview a figure or reference without leaving the page, jump back, generated contents, keyboard for everything | [sioyek.info](https://sioyek.info/), [Zotero forum request](https://forums.zotero.org/discussion/101257/fr-desktop-ios-improvements-of-pdf-reader-more-features-like-in-sioyek-pdf-reader) |
| Librera, KOReader, Moon+ Reader | crop white margins, reflow text for phones, auto-scroll, two-page view, dictionary and translation, many formats | [Librera on F-Droid](https://f-droid.org/packages/com.foobnix.pro.pdf.reader/), [KOReader guide](https://koreader.rocks/user_guide/), [Moon+ wiki](https://wiki.mobileread.com/wiki/Moon%2B_Reader) |
| Readwise Reader | highlights come back in a daily review with spaced repetition; export to Obsidian, Notion, Anki; questions and summaries about a document | [marqly.com review](https://www.marqly.com/blog/readwise-reader-review-2026), [Readwise docs](https://docs.readwise.io/readwise) |

Patterns across them:

- **Table stakes.** Search in the document, page thumbnails, two-page view, rotate, print, password PDFs.
  This app has none of these yet. They are the first thing a new user tries.
- **Phones.** PDFs are fixed pages on a small screen. The loved fixes are cropping the white margins and
  reflowing the text.
- **Markup that travels.** Pen, underline, shapes, signatures, form filling, and annotations saved into
  the PDF so other apps show them.
- **Remembering.** The feature Readwise users would not give up is the daily review of old highlights.
- **Free and calm.** Xodo is praised for having no account, no watermark and no nagging. This app already
  works that way; it should say so loudly.

## 4. Where the app stands

Has: library with covers, shelves, search and sort; resume; contents; smart dark, sepia and original pages
with brightness, contrast, sepia and grayscale; zoom, fit width, fit page, pinch; highlights in five colors,
passage notes and sticky notes with titles, bookmarks, eraser, undo and redo; notes panel with search and
Markdown export; read aloud with natural voices, smart skipping and a sleep timer; goals, streaks, stats and
reminders; backup and restore; English and Arabic; opt-in book lookup; desktop app; installable web app;
Chrome extension.

Lacks (checked in the code on 2026-10-07):

| Area | Missing |
|---|---|
| Reading | search in the book, thumbnails, two-page and single-page view, rotate, full screen, print, password PDFs, margin crop, reflow, auto-scroll, link preview and "go back" |
| Markup | underline, strikethrough, pen, shapes, text boxes, signature, form filling, saving annotations into the PDF, reading a PDF's existing annotations as editable |
| Study | review of highlights, flashcards, tags on notes, one notebook across books, search across the whole library |
| Smart | scanned PDFs without text (no search, no selection, no read aloud), dictionary, translation, summaries, contents for PDFs without an outline |
| Library | collections and tags, favorites, list view, "continue reading", other formats (EPUB and others) |
| PDF tools | merge, split, reorder, extract, delete pages |
| Reach | not in any store, no public page that explains it, no "open with" on desktop web, no sync between devices, private repository |
| Look | the design is clean but plain; no brand, no first-run welcome, little motion |

## 5. Rules that stay

- Private: everything runs on the device. A feature that needs a server, an account or a paid service is
  not built without the owner's yes.
- MIT, and no GPL or AGPL code. Checked per library below.
- Every feature reachable by a visible control. Layout from 320px to 1440px and wider. English and Arabic.
- Each slice ships with tests, passes the layout audit, and goes to production when it is green.
- Research before each phase: APIs and library versions are checked again when the phase starts.

## 6. Roadmap

Sizes: S is about a day of work in one session, M two to three, L more. Each phase is split into slices
that ship on their own.

### Phase A. Reading essentials (first, because every new user tries these)

| Slice | What | Size | Notes |
|---|---|---|---|
| A1 (done 2026-10-07) | Search in the book: box, match count, next and previous, matches marked on the page, list of results with their page | M | own index from pdf.js text; Arabic and diacritics folded |
| A2 (done 2026-10-07) | Page thumbnails as a grid under "Go to page"; drag the progress line to scrub, with a bubble showing page and chapter | M | a side strip was left out: the grid is one tap away and a strip costs reading width |
| A3 (done 2026-10-07, rotate left for later) | View modes: scrolling, page by page, two pages (with a cover page option, and right-to-left order for Arabic books); full screen | M | rotate needs highlights and notes turned with the page; it comes with the markup work in phase C |
| A4 (done 2026-10-07) | Crop margins: "fit text" zoom that cuts the white border, per book | S | measured by drawing each page small and finding its ink, which also sees charts and rules; kept with the book |
| A5 (done 2026-10-07) | Links: tap an internal link to jump, a Back button to return, and a preview of the target (figure, footnote, reference) on hover or long press | M | the Sioyek and Zotero favorite |
| A6 (done 2026-10-07) | Password PDFs, print, save a copy | S | the password stays on the device and out of backups; print uses the book's own colors |
| A7 (done 2026-10-07) | Auto-scroll with speed control; keyboard shortcut sheet; command palette (Ctrl/Cmd+K) | S | |

### Phase B. New look, welcome, library (the "modern" part)

| Slice | What | Size |
|---|---|---|
| B1 | Brand: name, icon, color, type, motion rules. One design pass over every screen with the design skills installed in this setup, checked by the layout audit | L |
| B2 (done 2026-10-07) | First run: a short welcome that opens the sample book and shows dark mode, highlighting and read aloud in three steps | S |
| B3 (done 2026-10-07; collections were folded into tags) | Library: "Continue reading" on top, collections and tags, favorites, grid or list, search inside all books and notes | M |
| B4 | A public page that explains the app, with the app itself one click away | S |

The rename happens in B1 if section 2 is settled. The desktop data folder is migrated in the same slice.

### Phase C. Markup that matches the best

| Slice | What | Size | Notes |
|---|---|---|---|
| C1 (underline and strikethrough done 2026-10-07; highlighting an area is left) | Underline, strikethrough; highlight an area (for scans and figures) | S | |
| C2 | Pen with pressure and an eraser, shapes, arrows, text boxes | L | own layer, saved like other notes |
| C3 | Export the PDF with its annotations inside, as standard PDF annotations other apps show | M | [`@cantoo/pdf-lib`](https://www.npmjs.com/package/@cantoo/pdf-lib), MIT, the maintained fork of pdf-lib |
| C4 | Fill forms and sign | M | pdf.js draws forms and can save them ([Nutrient guide](https://www.nutrient.io/blog/pdfjs-native-annotation-layer-forms/)) |
| C5 (done 2026-10-07) | Share a quote as a picture; copy with the book title and page | S | |

### Phase D. Study and remember

| Slice | What | Size | Notes |
|---|---|---|---|
| D1 | Review: highlights and notes come back as cards on a spaced schedule; a daily review screen; streak joins the reading streak | M | scheduling with the open FSRS algorithm (ts-fsrs); its license is checked when the phase starts |
| D2 | Notebook: all notes of all books in one place, with tags and filters | M | |
| D3 | Export to Anki and CSV, besides Markdown | S | |

### Phase E. Smart, still on the device

| Slice | What | Size | Notes |
|---|---|---|---|
| E1 | OCR for scanned PDFs: text for search, selection and read aloud | L | [tesseract.js 7](https://github.com/naptha/tesseract.js/releases), Apache-2.0, about 8 MB plus a language file. Arabic output order has open bugs upstream ([#4428](https://github.com/tesseract-ocr/tesseract/issues/4428)); test before promising it |
| E2 | Look up a word (Wiktionary, opt-in because the word leaves the device) | S | on iPhone the system menu already offers Look Up and Translate |
| E3 | Summarize a chapter, explain a passage, translate a selection with the browser's built-in model | M | Chrome on computers only: Summarizer and Translator since Chrome 138, Prompt API for web pages since 148 ([Chrome docs](https://developer.chrome.com/docs/ai/built-in-apis)). Not on phones, Safari, Firefox or the desktop app. Shown only where it works |
| E4 | Contents generated for PDFs that have none | M | from heading sizes |
| E5 | Natural Arabic voice | M | Supertonic 3 (MIT code, OpenRAIL-M model, about 404 MB); computers only |

### Phase F. More formats and PDF tools

| Slice | What | Size | Notes |
|---|---|---|---|
| F1 | Merge, split, reorder, rotate, extract and delete pages; pictures to PDF | M | same library as C3 |
| F2 | EPUB (and MOBI, FB2, CBZ) | L | [foliate-js](https://github.com/johnfactotum/foliate-js), MIT. A second renderer: highlights, read aloud and search must be wired again for it. Worth it only if the owner wants a general book reader, not a PDF reader |

### Phase G. Reach: easy to find, easy to install

| Slice | What | Cost | Notes |
|---|---|---|---|
| G1 | Make the repository public | free | open source builds trust in the privacy claim, makes desktop update checks work, and is needed for most listings. Owner's decision |
| G2 | Windows: Microsoft Store | free | individual accounts are free since September 2025 ([Windows blog](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/)). A Store install has no SmartScreen warning |
| G3 | Extension in Edge Add-ons and Firefox Add-ons | free | [Edge registration](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account) costs nothing. Firefox needs a port of the redirect rules |
| G4 | Extension in the Chrome Web Store | $5 once | the largest audience for "dark mode PDF" |
| G5 | "Open with" on computers for the installed web app | free | File Handling API, Chrome and Edge on computers only ([Chrome docs](https://developer.chrome.com/docs/capabilities/web-apis/file-handling)). Not possible on iPhone |
| G6 | Sync between a person's computers through a folder they choose (iCloud Drive, Dropbox, OneDrive) | free | folder access works in Chrome, Edge and the desktop app only ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)). On iPhone it stays "import a backup". Real sync for phones needs a server and accounts, which costs money and ends "no account" |
| G7 | Launch: Show HN, AlternativeTo, GitHub topics | free | after B and A are live; a public repository and no sign-up wall are what these audiences reward |
| G8 | Android (Play Store, $25 once) and iPhone App Store ($99 a year) | paid | owner's decision; not planned |

### Always: quality

- Speed: a 1,000-page book opens in under two seconds and scrolls without stalls; memory is watched.
- Accessibility: screen reader pass, contrast, reduced motion, keyboard for everything.
- The layout audit and all suites run before every release.
- A written checklist for a real iPhone, because the tools here only emulate one.

## 7. Recommended order

1. **A1 to A7**, shipped one by one. These close the gap that would make a new user leave.
2. **B1 to B4.** With the essentials in place, the new look and the welcome make the first minute good.
3. **G1 to G5** in parallel with B, because stores take days to review.
4. **C1, C3, C5**, then **D1 and D2.** Markup that travels and the daily review are what make people stay.
5. **E1** (scans), then **C2, C4, E3, E4, F1.**
6. **F2 and E5** only if the owner wants them.

## 8. What the owner needs to decide

1. **Name.** Is Reader343 the owner's, or used with its author's agreement? If not: keep "Smart Dark
   Reader", or pick a new name.
2. **Order.** The order in section 7, or another one.
3. **Public repository** (G1): yes or no.
4. **Stores.** Free ones (Microsoft Store, Edge, Firefox): go ahead? Chrome Web Store for $5?
5. **Scope.** Should it become a reader for EPUB and other book formats too (F2), or stay a PDF reader?

## 9. Honest limits

- "Every feature" has no end. The plan picks what the research shows people use and love, and leaves out
  enterprise features such as redaction, compare and e-signature workflows.
- iPhone as a web app cannot open a PDF from the Files app, run the natural voices, or sync a folder. A
  native app removes those limits and costs $99 a year.
- Built-in browser AI exists only in Chrome on computers today.
- Nothing has been checked on a real iPhone.
- Vercel's free plan is for non-commercial use.
