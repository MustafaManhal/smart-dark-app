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
| `--bg` | `#f3f1ec` | `#0e0f11` | the screen behind everything |
| `--surface` | `#fbfaf7` | `#16171a` | cards, bars |
| `--surface-2` | `#ece9e2` | `#1f2024` | hover, quiet fills |
| `--surface-3` | `#e0dcd3` | `#2a2b31` | pressed, switch tracks |
| `--raised` | `#ffffff` | `#1c1d21` | sheets and menus, which float |
| `--text` | `#1b1a17` | `#ececef` | words |
| `--muted` | `#68655e` | `#9c9da6` | second-line words, labels |
| `--faint` | `#8d897f` | `#73747d` | placeholders only |
| `--border`, `--border-strong` | `#e2ded5`, `#cfcabf` | `#26272c`, `#37383f` | hairlines; the strong one outlines controls |
| `--accent` | `#4353d8` | `#9aa5ff` | the one action color, focus rings, progress |
| `--accent-soft`, `--accent-strong` | tint, `#3442b8` | tint, `#b6bdff` | the chosen option: soft fill with strong words |
| `--danger` | `#c2372f` | `#ff8a80` | removing things |

The reader has its own sets of the same tokens for dark and sepia pages (`reader.css`), because its chrome
follows the page style and not the app theme. A new token must be added to all of them; the layout audit
catches a missed one as low contrast.

- The light theme is warm paper, the dark theme is neutral near-black. One accent color; a screen does not
  get a second one. Highlight colors (yellow, green, blue, pink, purple) belong to the reader's marks only.
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
  `--radius` (16px), sheets 22px at the top, pages of a book 4px.
- One shadow, `--shadow`, for things that float (sheets, bars, covers). Flat things have a hairline border.
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
