# Reader343: the redesign, and every roadmap item left

Written on 2026-10-07 after three instructions from the owner on that day:

1. "i do not want you to pass anything from A to G in the plan, do them all"
2. "redesign the whole thing, new modren design, make a research and inspiration before you do a redesign so
   the redesign well be the most beatiful pdf editer and viewer out there"
3. "make a plan and save it", and "for any questions take the Recommended as an answer if there is no
   recommended make your research and Pick the best answer"

This plan replaces slice B1 of `2026-10-07-next-level-roadmap.md` with a full redesign and lists every item
of phases A to G that is not built yet, in the order it will be built. Where a choice had to be made, the
choice and its reason are written down in section 3 so the owner can overrule it.

## 1. Where things stand

Built and live on https://smart-dark-app.vercel.app:

| Phase | Done |
| --- | --- |
| A | all of it: search, thumbnails, view modes, rotate, crop margins, links with Back and preview, passwords, print, save a copy, auto-scroll, command list, shortcut sheet |
| B | B2 welcome with sample book and tour, B3 library (continue reading, favorites, tags, list view, search in notes and inside all books) |
| C | C1 underline and strikethrough, C5 share a quote |

Not built yet: B1 (now the redesign), B4, the area highlight of C1, C2, C3, C4, all of D, E, F and G.

## 2. Research: what the best readers do

Sources are listed at the end. No single app is "the most beautiful PDF reader"; the praise in reviews goes
to a small set of habits, and the complaints go to the opposite habits.

**What gets praised**

- **The page comes first and the tools step back.** Readwise Reader is described as "brutally minimal":
  no toolbars while reading, the interface appears on demand and leaves again, lines of about 65
  characters, notes beside the text and not over it. Its highlight colors copy real highlighter pens (soft
  yellow `#FBDA83`, coral `#E4938E`, blue `#8DBBFF`).
- **Tools by task, options by context.** PDF Expert on the Mac shows only the tools of the active mode
  (Annotate, Edit, Fill and Sign) and puts their options in an inspector that appears when a tool is picked.
  PCWorld counts the lost menu hunting as a real time saving. On the iPad the tool strip can sit on the edge
  the person prefers and one tap hides everything.
- **One place for the parts of a document.** Zotero 7 replaced its tab row with one pane of collapsible
  sections and a small side navigation, added a Comfortable and a Compact density, and shows a popup with
  the target when the pointer rests on a reference. PDF Expert keeps thumbnails in a left sidebar.
- **Depth from surfaces, not from shadows.** Linear builds its look from four steps of near-black, hairline
  borders, one accent color used sparingly, Inter with three weights (400, 510, 590) and tight titles.
- **Controls where the thumb is.** Apple Books moved its controls from the top to the bottom of the screen
  in iOS 16.

**What gets criticized**

- **Controls that float over the words.** The Apple Books menu button and progress bubble sit on the text
  and readers complain they cover it and are hard to hit.
- **Glass over content.** Nielsen Norman Group's review of Liquid Glass is that it hides content it was
  meant to show; Apple itself reduced the transparency a year later. Trend guides for 2026 now say: frosted
  surfaces only for a few floating pieces, and never below a 4.5 to 1 contrast.
- **Dated density.** Reviews mark PDF-XChange down for a crowded ribbon. Sumatra wins on calm and speed but
  loses on features.

**What this means for Reader343.** The app already has the features of the praised readers. It does not yet
have their order: eight tools in one row, three different places for contents, pages and notes, and floating
pieces that sit on the first lines of the page on a phone. The redesign is mostly about arrangement and
restraint, then about finish (type, surfaces, motion).

## 3. Decisions taken (the recommended answer each time)

| Question | Decision | Why |
| --- | --- | --- |
| Design direction | **"Quiet page"**: the book fills the screen, one thin bar above it, tools appear by task, everything else lives in one side panel | It is what reviews praise in Readwise Reader, PDF Expert and Zotero 7, and it fixes the crowding the app has now |
| Phone layout | Tools move to a **dock at the bottom**, under the page and not over it; the top keeps Back, the title, Search and the menu. A tap on the page hides both | Thumb reach (Apple Books moved down); the complaint about Books is controls over text, so the dock takes its own space and hides fully |
| Wide screens | A **side panel on the left** with tabs: Contents, Pages, Notes, Bookmarks. It can stay open beside the page | Zotero 7 and PDF Expert both do this; today the same things are in three different sheets |
| Tool options | An **inspector strip** under the bar, shown only while a tool is on (color, style, thickness, eraser) | PDF Expert's contextual inspector; replaces today's separate hints |
| Typeface | **Inter**, variable, hosted with the app (no request to another server). System font for Arabic | One look on Windows, Mac and iPhone; Inter is under the SIL Open Font License, which an MIT project may ship with its license file; the Latin subset is about 50 to 100 KB |
| Color | Keep **warm paper** for light and **ink black** for dark. Four surface steps per theme, hairline borders, one accent (a refined indigo). Highlight colors softened to highlighter-pen tones | Linear's surface ladder; the current palette is already close and readers know it |
| Glass | Translucent only on the bar, the dock and floating pieces, at 88% or more of the surface color, with a solid fallback | The 2026 guidance and the Liquid Glass criticism |
| Shadows | One soft shadow for things that float; cards and rows use borders | Calm, and cheaper to draw on phones |
| Icons | Keep the app's own stroke icons, redrawn on one grid at one weight (1.5px), with the missing ones added | No license question, and they already match |
| App icon | Keep the idea (a page half light, half dark, colored lines that keep their color) and **redraw it** cleaner, in the new colors, for every size | The idea explains the product without words; the drawing is from the first week |
| Density | Comfortable by default, with a **Compact** setting for the library and panels | Zotero 7 |
| Motion | 150 ms for color and opacity, 250 ms with one easing curve for movement; none with "reduce motion" | Already the rule in `docs/brand.md` |
| EPUB (F2) | **Included**, at the end | The owner said earlier "stay pdf for now", then "do them all" for A to G. The later instruction wins; it is last so it can still be dropped |
| Stores (G) | Everything is prepared up to the last step. **Paying and submitting stay with the owner** | Fees and store accounts are the owner's; the standing rule is to ask before anything that costs money |

## 4. The redesign, slice by slice

Each slice ships by itself to `main` when every suite passes. Each one is checked at 320, 390, 768 and
1280px, in light and dark, in English and Arabic, by the layout audit, which also gets a contrast check
(4.5 to 1 for text) in slice R0.

| Slice | What changes | Main files |
| --- | --- | --- |
| **R0 Foundations** | Tokens: four surfaces per theme, hairlines, type scale on Inter, radii, motion. Base pieces restyled once: button, icon button, chip, segmented control, toggle, slider, field, card, sheet, toast, menu. Icons redrawn. Compact density setting. Audit learns contrast | `app/src/app.css`, `app/src/ui/*`, `scripts/copy-*`, `test/app-e2e/layout-audit.spec.ts` |
| **R1 Reader frame** | One thin top bar (Back, title and chapter, Search, menu). Tools grouped: Mark (highlighter, eraser, sticky note), Listen, Panel, Appearance. Phone: bottom dock. Page number and zoom become one small cluster at the edge. Inspector strip for the active tool. Selection bar, mark menu, note editor, read-aloud and auto-scroll bars in the new style | `reader/ReaderScreen.tsx`, `reader/reader.css`, `annotations/*` |
| **R2 Side panel** | Contents, Pages (thumbnails), Notes and Bookmarks in one panel with tabs: docked on wide screens, a tall sheet on phones. Replaces the Contents sheet, the thumbnail grid inside "Go to page" and the notes panel. Search results join it as a fifth tab while a search is open | new `reader/SidePanel.tsx`, `annotations/NotesPanel.tsx`, `reader/PageGrid.tsx` |
| **R3 Library** | A "Continue reading" hero with the cover large and a progress ring. Cover grid with better cards (title on the cover when there is none, progress as a thin line, star and menu on hover or always on touch). One row of filters. List view and search results in the same card language. Welcome redrawn | `library/*` |
| **R4 Sheets and dialogs** | Appearance with theme swatches that show the real page colors, Book menu, Book details, Backup, Password, Share a quote, Shortcuts, Command list, Go to page | `ui/Sheet.tsx`, each sheet |
| **R5 Stats and Settings** | Stats: a clear header (streak, today), charts redrawn in the new type and colors. Settings: grouped sections with a side list on wide screens | `stats/*`, `settings/*` |
| **R6 Identity** | New drawing of the app icon at every size (web, iPhone, desktop, extension), favicon, splash colors. `docs/brand.md` rewritten to the new rules. Store pictures taken again | `scripts/make-icons.mjs`, `app/public/icons`, `desktop/build`, `src/icons` |
| **R7 Extension** | The viewer, popup and welcome page of the Chrome extension take the same tokens and pieces | `src/shared/ui.css`, `src/viewer/*`, `src/popup/*` |
| **R8 Public page (B4)** | One page that explains the app with real screenshots, the privacy promise, where to get it, and the app one click away. English and Arabic | `app/public/about/` |

Rules that do not change: every feature keeps a visible, named control; the page indicator stays small; the
whole-book progress line with chapter ticks stays; highlights stay separate from notes; removing a highlight
stays one tap; notes open in a panel or dialog; Arabic runs right to left with Western digits; nothing is
fetched from another server.

## 5. Every roadmap item left, in build order

After the redesign, so new screens are built once, in the new look.

| Order | Item | What | Notes |
| --- | --- | --- | --- |
| 1 | C1 rest | Highlight an area (for scans and figures) | drag a rectangle with the highlighter when there is no text under it |
| 2 | C3 | Export the PDF with highlights, underlines, notes and sticky notes inside, as standard PDF annotations | `@cantoo/pdf-lib` (MIT); license and API checked before it is added |
| 3 | D2 | Notebook: all notes of all books in one place, with tags and filters | builds on the library search |
| 4 | D1 | Review: marks and notes come back as cards on a spaced schedule; a daily review screen; its streak joins the reading streak | `ts-fsrs`; license checked first |
| 5 | D3 | Export to Anki and CSV, besides Markdown | |
| 6 | E1 | OCR for scanned PDFs: text for search, selection and read aloud | tesseract.js 7 (Apache-2.0), files hosted with the app; Arabic tested before it is promised |
| 7 | C2 | Pen with pressure, its eraser, shapes, arrows, text boxes | own layer; exported by C3 |
| 8 | C4 | Fill forms and sign | pdf.js form layer; saved through C3 |
| 9 | E4 | Contents generated for PDFs that have none | from heading sizes |
| 10 | E2 | Look up a word | opt-in, because the word leaves the device |
| 11 | E3 | Summarize, explain, translate with the browser's built-in model | Chrome on computers only; hidden elsewhere |
| 12 | F1 | Merge, split, reorder, rotate, extract and delete pages; pictures to PDF | same library as C3 |
| 13 | G5 | "Open with" for the installed web app | manifest `file_handlers` |
| 14 | G6 | Sync through a folder the person chooses | Chrome, Edge and the desktop app |
| 15 | G2, G3, G4 | Store packages: Microsoft Store (MSIX), Edge Add-ons, Firefox port, Chrome Web Store | built, listed text and pictures ready; **the owner pays the $5 for Chrome and presses submit** |
| 16 | G7 | Launch texts: Show HN, AlternativeTo, GitHub topics | written and saved; the owner posts them |
| 17 | E5 | Natural Arabic voice | Supertonic 3; the model's license (OpenRAIL-M) is read first, and it is dropped with a note if it does not fit |
| 18 | F2 | EPUB (and MOBI, FB2, CBZ) | foliate-js (MIT); a second renderer |
| 19 | G8 | Android and iPhone stores | packages prepared; fees ($25, $99 a year) and accounts are the owner's |
| always | Quality | speed with a 1,000-page book, screen reader pass, a written checklist for a real iPhone | |

G1 (public repository) is already true.

## 6. How the work is done

- One slice at a time: build, test, push to `main`, check the live site. No slice is pushed with a failing
  test. The natural-voice test can time out when all suites run at once; it is then run by itself before a
  push.
- Before a library is added: its license and current API are checked against its own pages. Nothing under
  GPL or AGPL is bundled.
- Nothing leaves the device unless the reader turned that feature on, and the screen says what is sent.
- Choices are made without waiting (the recommended one, or the best after research) and written into
  `HANDOFF.md`. Money, the license, data leaving the device and store accounts are still the owner's.
- `HANDOFF.md` and the roadmap are updated with each slice.

## Sources

- [Readwise Reader design guide (Blake Crosley)](https://blakecrosley.com/guides/design/readwise-reader)
- [Readwise docs: Appearance](https://docs.readwise.io/reader/docs/faqs/appearance)
- [Zotero 7: Zotero, redesigned](https://www.zotero.org/blog/zotero-7/)
- [PCWorld: PDF Expert review](https://www.pcworld.com/article/819837/pdf-expert-pdf-editor-review-2.html)
- [Readdle: introducing PDF Expert 7](https://pdfexpert.com/blog/introducing-pdf-expert-7)
- [TheSweetBits: PDF Expert 2026 review](https://thesweetbits.com/tools/readdle-pdf-expert/)
- [Beebom: best PDF reader apps in 2026](https://beebom.com/best-pdf-reader/)
- [Denser.ai: 10 best PDF readers in 2026](https://denser.ai/blog/best-pdf-reader/)
- [TidBITS: how Apple's Books app changed in iOS 16](https://tidbits.com/2022/10/03/apples-books-ios-16/)
- [Basic Apple Guy: My Beef with Books](https://basicappleguy.com/basicappleblog/build-a-better-books)
- [Nielsen Norman Group: Liquid Glass is cracked](https://www.nngroup.com/articles/liquid-glass/)
- [Apple: Get to know the new design system (WWDC25)](https://developer.apple.com/videos/play/wwdc2025/356/)
- [Linear design tokens, as measured by DesignMD](https://designmd.cc/benchmarks/linear)
- [Orizon: 10 UI/UX trends that will shape 2026](https://www.orizon.co/blog/10-ui-ux-trends-that-will-shape-2026)
- [Index.dev: 12 UI/UX design trends for 2026](https://www.index.dev/blog/ui-ux-design-trends)
- [@fontsource-variable/inter on npm](https://www.npmjs.com/package/@fontsource-variable/inter)
