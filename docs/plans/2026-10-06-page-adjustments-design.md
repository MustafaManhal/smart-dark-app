# Page adjustments: brightness, contrast, sepia, grayscale (design)

Approved by the owner on 2026-10-06. The reference is a screenshot of the Dark Reader popup with Brightness
at -10, Contrast at +5, Sepia at +50 and Grayscale off.

**Research (2026-10-06):** Dark Reader is MIT licensed (Dark Reader Ltd.), so its formulas can be reused
with credit. `src/generators/utils/matrix.ts` builds one color matrix in this order: sepia, grayscale,
contrast, brightness. In its default mode the matrix is applied to computed colors only and images are left
alone. `src/ui/popup/components/filter-settings/index.tsx` gives the slider ranges: brightness and contrast
50 to 150 with a default of 100, sepia and grayscale 0 to 100 with a default of 0, all in steps of 5.

## Decisions

- The adjustments change text and paper. Photos keep their real colors, as they do today.
- All forms get the sliders: the web and iPhone app, the desktop app and the Chrome extension viewer.
- The work happens in the shared color engine, after the dark or sepia mapping. A CSS `filter` on the canvas
  was rejected because it cannot skip photos.
- A slider at a low brightness or contrast can take colored text under WCAG AA. The engine does not correct
  this, because the user asked for it.

## Engine (`src/viewer/smart-invert.js`)

- `ADJUST_DEFAULTS = { brightness: 100, contrast: 100, sepia: 0, grayscale: 0 }` and `ADJUST_RANGES` with
  min, max and step for each value.
- `createAdjuster(values)` returns `null` when every value is at its default. Otherwise it returns
  `(r, g, b) => [r, g, b]`, which applies one precomputed 3x4 matrix and clamps to 0..255. Values outside
  the ranges are clamped first. The matrix formulas come from Dark Reader and the source file says so.
- `createColorMapper(theme, { contrast, adjust })` and `createTintMapper(tint, { adjust })` run the adjuster
  on their result before packing it. The existing color cache then stores the adjusted color, so the cost
  per page does not change.
- `createPlainMapper(adjust)` maps a color to itself and then adjusts it. It is used for Original pages.
- `adjustColor(rgb, adjust)` returns an adjusted `[r, g, b]`. Callers use it for the page background.

With every value at its default there is no adjuster and the output is the same as today, byte for byte.

## App (`app/`)

- Settings: `adjBrightness`, `adjContrast`, `adjSepia`, `adjGrayscale`, stored in the existing key and value
  settings store. No database version change. Backups already carry all settings.
- `RenderOptions` gains `adjust`. `Renderer.setOptions` builds the adjuster, passes it to the mapper, adds
  the four values to `styleKey` so pages draw again, and sets `--page-bg` to the adjusted paper color.
- On Original pages the renderer uses the plain mapper only when an adjustment is active. Photos there keep
  full brightness (`imageDim: 1`). With no adjustment, Original pages skip processing as they do today.
- `app/src/reader/AdjustControls.tsx`: one component used by the Appearance sheet in the reader and by the
  Settings screen. It has four rows. Each row has a decrease button, a range input, an increase button and
  the value. Brightness and contrast show the distance from 100 as `+5` or `-10`. A value at its default
  shows `off`. The value is wrapped so it reads left to right in Arabic. A Reset button appears when any
  value is not at its default.
- Dragging a slider updates the number at once and saves when the drag ends, so the page draws once. The
  buttons save on each press.
- The rows fit a 320px screen. Each control has a visible label and an accessible name. Arabic strings go
  into `app/src/i18n/ar.ts`.
- The Page choice (Original, Sepia, Smart dark) stays as it is and plays the part of Dark Reader's Dark and
  Light switch. The sepia slider adds warmth on top of any page style.

## Extension (`src/`)

- Settings: the same four keys with the same defaults in `src/shared/settings.js`.
- The Appearance panel in the viewer gets the four sliders and a Reset button. `applySettings` builds the
  adjuster, adds the values to `styleKey` and adjusts `--page-bg` and `--page-fg`.
- The existing "Text contrast" slider stays, because it controls the gray curve of the dark mapping. Its
  label becomes "Text boost" so the panel does not show two contrast sliders.
- With smart dark off, the viewer shows original colors and ignores the adjustments, as it ignores the theme
  today.

## Tests

- `test/unit/smart-invert.test.mjs`: the adjuster is `null` at defaults; brightness, contrast, sepia and
  grayscale each match hand-computed values; mapper output with a default adjuster equals output without
  one; out-of-range values are clamped.
- `test/app/`: settings defaults and saving; `AdjustControls` buttons, value labels and Reset.
- `test/app-e2e/` (Chromium and WebKit iPhone 15): lowering brightness darkens a paper pixel; full grayscale
  removes color from colored text; a photo pixel does not change; values survive a reload; the Appearance
  sheet has no horizontal overflow at 320px.
- `test/e2e/e2e.mjs`: the viewer panel changes page pixels and Reset restores them.

## Out of scope

- Adjusting photos, or a switch for it.
- A live preview while the slider is still moving.
- Per book or per site values. The values apply to every book.
