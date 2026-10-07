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
- The mark stands on the dark tile `#181b24`. It is never recolored, stretched or given a shadow.
- Mark and name together are the `Brand` component (`app/src/ui/Brand.tsx`). It appears once on the library
  screen, on the welcome, on the public page and under About. It does not appear inside the reader: there the
  book is what matters.

## Color

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#f5f3ee` | `#111215` | the screen behind everything |
| `--surface` | `#fffefb` | `#191a1e` | cards, sheets, bars |
| `--surface-2` | `#ece9e2` | `#232429` | hover, quiet fills |
| `--text` | `#1c1b19` | `#ebebee` | words |
| `--muted` | `#6d6a63` | `#9a9ba3` | second-line words, labels |
| `--border` | `#e0dcd3` | `#2b2c32` | hairlines |
| `--accent` | `#3550c9` | `#91a7ff` | the one action color, focus rings, progress |
| `--danger` | `#c2372f` | `#ff8a80` | removing things |

- The light theme is warm paper, the dark theme is neutral near-black. One accent color; a screen does not
  get a second one. Highlight colors (yellow, green, blue, pink, purple) belong to the reader's marks only.
- Text on its background meets WCAG AA (4.5 to 1) in both themes.

## Type

- The font is the system's own (`--font`): San Francisco on Apple devices, Segoe UI on Windows. No web font
  is downloaded, which also keeps the promise that nothing is fetched from elsewhere.
- Sizes: `--text-xs` 12px (hints, keys), `--text-sm` 13px (labels, second lines), `--text-md` 15px (body),
  `--text-lg` 18px (sheet titles), `--text-xl` 26 to 34px (the title of a screen).
- Weights: 400 for body, 600 for names and buttons, 650 to 700 for titles. Titles are set a little tight
  (`letter-spacing: -0.02em`).
- Numbers that change (page, zoom, speed) use tabular figures. Digits are Western in every language.

## Shape

- Controls are pills (`border-radius: 999px`). Cards and sheets use `--radius` (14px), small pieces
  `--radius-sm` (10px), pages of a book 4px.
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
