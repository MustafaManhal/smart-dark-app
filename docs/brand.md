# Reader343: brand and design rules

These are the rules the app follows on every screen. They describe what is built (the tokens live in
`app/src/app.css`); a new screen should be made from them, and a change to them belongs here first.

## Name

- The name is **Reader343**, one word, capital R, no space before the number. It is not translated and not
  written in Arabic letters. The name is shared with the Android app of the same name by agreement with its
  author; nothing else of that app (code, pictures, text) is used.
- Store listings may add a plain description after a colon, as the extension does: "Reader343: Smart Dark
  PDF Reader".
- "Smart dark" is the name of the page style, written in lower case inside sentences.

## Mark

- The mark is a page split down the middle, light on the left and dark on the right, with three colored
  lines that keep their color on both halves. It says what the app does without words. `scripts/make-icons.mjs`
  draws it at every size.
- The lines have round ends and the three marking colors (red, the accent's indigo, green). The mark stands
  on an ink tile that deepens from `#1b1d28` to `#10111b`. It is never recolored, stretched or given a shadow.
- Mark and name together are the `Brand` component (`app/src/ui/Brand.tsx`). It appears once on the library
  screen, on the welcome, on the public page and under About. It does not appear inside the reader: there the
  book is what matters.

## Color

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#f3f4f8` | `#0b0c11` | the screen behind everything |
| `--surface` | `#ffffff` | `#14161d` | cards, bars, the sidebar |
| `--surface-2` | `#eceef4` | `#1d2029` | hover, quiet fills |
| `--surface-3` | `#dfe2eb` | `#2a2e3a` | pressed, switch tracks |
| `--raised` | `#ffffff` | `#191b23` | sheets and menus, which float |
| `--text` | `#14151a` | `#eef0f6` | words |
| `--muted` | `#595d6b` | `#a1a6b6` | second-line words, labels |
| `--faint` | `#6f7382` | `#7f8496` | placeholders only |
| `--border`, `--border-strong` | `#e2e4ec`, `#cbcfda` | `#242836`, `#363b4c` | hairlines; the strong one outlines controls |
| `--accent`, `--accent-2` | `#4f46e5`, `#7c3aed` | `#a5abff`, `#c9a8ff` | the action color and its partner in the brand's gradient (`--brand`) |
| `--accent-soft`, `--accent-strong` | tint, `#4038c7` | tint, `#bfc3ff` | the chosen option: soft fill with strong words |
| `--danger` | `#c2372f` | `#ff8a80` | removing things |
| `--c-mark` | `#d99a00` | `#f5c043` | marking: highlight, erase, sticky notes |
| `--c-draw` | `#e5534b` | `#ff8078` | drawing |
| `--c-listen` | `#159a6c` | `#4fd6a5` | read aloud, auto-scroll, sync |
| `--c-find` | `#2380dd` | `#6cb4ff` | bookmark, notes, contents, stats |
| `--c-files` | `#7c3aed` | `#b79bff` | files and pages: scan text, print, save, PDF tools |
| `--c-learn` | `#d6478f` | `#ff8cc4` | look of the page, daily review |

The reader has its own sets of the same tokens for dark and sepia pages (`reader.css`), because its chrome
follows the page style and not the app theme. A new token must be added to all of them; the layout audit
catches a missed one as low contrast.

- Since the second redesign ("Open desk", `docs/plans/2026-10-07-open-desk-redesign.md`) the light theme is
  white cards on a cool gray ground and the dark theme a blue-black. The main action carries the brand's
  gradient.
- **A color for each family of features.** The icon of a tool has its family's color; its word stays in the
  text color. The same colors mark the cards of the home screen. Highlight colors (yellow, green, blue,
  pink, purple) belong to the reader's marks only.
- Text on its background meets WCAG AA (4.5 to 1) in both themes.

## Type

- The font is Inter (variable, SIL Open Font License), shipped with the app, so nothing is fetched from
  elsewhere and the app looks the same on Windows, Mac and iPhone. Inter has no Arabic letters; Arabic uses
  the system's font.
- Sizes: `--text-xs` 12px (hints, keys), `--text-sm` 13px (labels, second lines), `--text-md` 15px (body),
  `--text-lg` 18px (sheet titles), `--text-xl` 26 to 34px (the title of a screen).
- Weights: 400 for body, 600 for names and buttons, 650 to 700 for titles. Titles are set a little tight
  (`letter-spacing: -0.02em`).
- Numbers that change (page, zoom, speed) use tabular figures. Digits are Western in every language.

## Shape

- Buttons and icon buttons have 12px corners, option tiles and fields 10px, filter chips are pills. Cards use
  `--radius` (18px), sheets 22px at the top, pages of a book 4px.
- Three shadows: `--shadow-sm` under every card, `--shadow` under what floats or is hovered, `--shadow-lg`
  for the largest things. Cards also keep a hairline border, so they hold on a dark ground.
- Touch targets are at least 40px, 44px on the phone for the main ones.

## Motion

- `--fast` (0.15s) for color, opacity and hover. `--slow` (0.25s) with `--ease` for things that move (bars
  sliding away, sheets, covers lifting).
- Nothing moves to decorate. Movement shows where something came from or went.
- With "reduce motion" on, transitions and animations are off (`app.css`), and smooth scrolling is not used.

## Words

- Plain words, short sentences, no jargon. A button says what it does ("Save a copy", "Rotate right").
- Messages say what happened and, when something failed, what to do next.
- The app never says "we": it has no people behind a server. It says what stays on the device.
- Every string has an Arabic translation (`app/src/i18n/ar.ts`); the layout is checked in both directions.

## Layout

- Everything works from 320px to wide desktop screens. `test/app-e2e/layout-audit.spec.ts` walks every state
  at 320, 390, 768 and 1280px in English and Arabic and fails on anything cut off, covered or stretched.
- Every feature has a visible control with a name. Keys and the command list are a second way, never the
  only one.
- **Every control has a word.** An icon alone is allowed for back, close, and the plus and minus of a number.
  `IconButton` takes `text` for the word; `label` stays the full name for screen readers.
- **The places of the app are always on screen** (`ui/Shell.tsx`): a sidebar with names on wide screens, a
  bar of five named tabs on phones. The readers are the only screens outside it.
- **The reader's tools are on a named toolbar:** a second row of the top bar on wide screens (sixteen tools
  in groups), two rows of five in the dock on phones. "All tools" lists everything as cards with a line each.
- The home screen says what the app can do: the cards of "What you can do", beside the books on wide screens.
- Bars push the page and leave with a tap on it. Nothing lies over the page while it is read.
