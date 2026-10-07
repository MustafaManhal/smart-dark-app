# "Open desk": the second redesign

Date: 2026-10-07. Asked for by the owner after seeing the first redesign ("Quiet page") live: "it is still
the old look", and "I want all the features to be visible to the user, to know they exist".

## What was wrong with the first one

It was checked in the owner's own Chrome: the site served the new build. The look had changed (colors,
type, spacing) but the structure had not. On a wide screen the library was a title, five small icons with
no words, and one book in a large empty page. In the reader, ten icons without words sat in a corner, and
print, save, text recognition, crop, rotate, auto-scroll, page editing and summaries were behind a "⋯".
A person could use the app for a month and not know half of it exists.

## Research

- **Icons need words.** Nielsen Norman Group: only a few pictograms (home, print, the search glass) are
  understood without a label; everything else leaves people guessing.
  [Icon Usability](https://www.nngroup.com/articles/icon-usability/),
  [Yes, Icons Need Text Labels](https://www.nngroup.com/videos/icon-text-labels/)
- **Hidden navigation is found half as often.** NN/g measured 179 people on six sites: navigation behind a
  menu icon was used about half as often as visible navigation, took longer, and felt harder. Sites that
  kept the menu visible at the top or the left saw it used in more than 43% of visits.
  [Beyond the Hamburger](https://www.nngroup.com/articles/find-navigation-desktop-not-hamburger/)
- **Icon with label beats label alone beats icon alone**, and people remember where a control is sooner
  than what it looks like. [CXL's summary of UIE research](https://cxl.com/blog/icon-usability-testing/)
- **Acrobat's 2023 interface** put an "All tools" pane with named tools beside the document. What users
  complained about is worth as much as what Adobe did: buttons with no text labels, and a panel that sits
  on top of the page and cannot be moved. Adobe later added the word "Menu" to its menu icon.
  [Workspace basics](https://helpx.adobe.com/acrobat/using/workspace-basics.html),
  [user feedback](https://acrobat.uservoice.com/forums/590923-acrobat-for-windows-and-mac/suggestions/46781530-new-interface-is-unusable-june-2023)
- **UPDF 2.0** replaced scattered menus with one toolbox and a home screen with a few named entry points.
  [UPDF 2.0 release notes](https://updf.com/news/updf-2-0-is-released/)
- **iLovePDF's home page** is a grid of cards: each tool has a name and one line that says what it does.
  [ilovepdf.com](https://www.ilovepdf.com/)
- **PDF Expert** groups tools into named sets (Annotate, Insert, Fill & Sign).
  [Readdle support](https://support.readdle.com/pdfexpert/en_US/tips-and-tricks/work-with-pdf-tools-and-customize-the-toolbar)

## Rules of the new design

1. **Every control has a word.** An icon alone is allowed only for back, close and the plus and minus of a
   number.
2. **Nothing a person needs is behind "⋯".** Places of the app are always on screen (a sidebar on wide
   screens, a tab bar on phones). Tools of the reader are on a toolbar with names. A full list, "All tools",
   stays one tap away for the long tail.
3. **Bars push the page, they do not cover it,** and a tap on the page still hides them for reading.
4. **A color for each family of features,** so the eye learns where things are: marking (amber), drawing
   (coral), listening (green), finding (blue), files and pages (violet), learning (pink).
5. **Stronger shapes:** white cards on a cool ground with a real shadow, larger headings, one gradient for
   the brand and for the main action.

## Slices

| Slice | What | State |
|---|---|---|
| D1 | New colors, shadows, feature colors, primary button (`app.css`) | done 2026-10-07 |
| D2 | App shell: sidebar with named places on wide screens, tab bar with names on phones (`ui/Shell.tsx`) | done 2026-10-07 |
| D3 | Library home: tools grid (what the app can do, each with one line), larger "continue reading" | done 2026-10-07 |
| D4 | Reader: a second bar row with sixteen named tools, including what was in the Book menu; phones get a dock of two rows of five (an earlier rule, kept as a test, says no tool may need scrolling to) | done 2026-10-07 |
| D5 | "All tools" in place of the Book menu: a grid in groups | done 2026-10-07 |
| D6 | E-book reader: names under its tools | done 2026-10-07 |
| D7 | Pictures of the public page and the stores made again; `docs/brand.md` rewritten | done 2026-10-07 |

Kept from the first redesign: Inter, the icon set, the app icon, sheets, the page styles of the reader.

## Not changed on purpose

- Accessible names of existing controls stay, so screen-reader users and the 300 tests keep their bearings.
- The extension's viewer keeps its look (it has six controls, all already on one bar).

## What changed while building

- The phone dock was first one row that scrolled sideways. A test from the first design, which holds the
  owner's rule that every tool is on screen on a phone, failed. It is now two rows of five named tools;
  crop, rotate, scan text, print, save and pages are under "All tools" there.
- The cards of "What you can do" first sat above the books and pushed them off a laptop's screen. On wide
  screens they are now a column beside the books; on phones they come after the books, because the tab bar
  already names the places.
- Tests: `test/app-e2e/open-desk.spec.ts` holds the rules (named places on screen, a word on every tool).
  The layout audit learned two things: the tab bar of a phone stays put over a screen that scrolls, and a
  toolbar may scroll sideways on a narrow window.
