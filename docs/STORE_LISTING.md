# Chrome Web Store submission

Copy these fields into the [Developer Dashboard](https://chrome.google.com/webstore/devconsole).
Upload `smart-dark-pdf-<version>.zip` (made by `npm run package`).

## Store listing tab

**Name** (from manifest): Smart Dark PDF Reader

**Summary** (from manifest, 132 characters max):
Read PDFs in dark mode that keeps colors and photos intact. Text and pages go dark; no harsh color inversion.

**Category:** Tools
**Language:** English

**Description:**

```
Dark mode for PDFs that keeps the colors right.

Most PDF dark modes invert the whole page. Black text turns white, but red turns cyan, blue turns orange, and every photo becomes a negative. Smart Dark PDF Reader works differently: it changes only how light or dark each color is and keeps its hue.

• White paper becomes a calm dark background, black text becomes soft light text
• Red stays red, blue links stay blue, chart colors stay recognizable
• Photos and illustrations keep their real colors
• Scanned pages and screenshots of text are darkened like the rest of the page
• Highlighted text keeps a visible highlight
• Colored text is adjusted to meet WCAG AA contrast on the dark page

Themes: Dark, Dim, Black (OLED), Warm night, Slate blue.
Images: smart (keep photos, darken scans), keep all, dim all, or darken all.

Also included:
• Opens PDF links automatically (you can turn this off)
• Open PDFs from your computer, or drag and drop them
• Select and copy text, follow links
• Zoom, fit to width or page, keyboard shortcuts
• One click back to the original colors (press D)
• Open the same PDF in Chrome's built-in viewer when you need to print or fill a form

Privacy: PDFs are processed on your device. Nothing is uploaded, and there is no tracking or analytics.

Built on Mozilla's open-source PDF.js.
```

**Graphic assets** (in `store/`):

- Store icon: `src/icons/icon128.png`
- Screenshots (1280x800): `screenshot-1-smart-dark.jpg`, `screenshot-2-before-after.jpg`, `screenshot-3-paper.jpg`
- Small promo tile (440x280): `promo-small-440x280.jpg`

## Privacy practices tab

**Single purpose:**
Display PDF documents in a readable dark theme that keeps the document's colors and photos.

**Permission justifications:**

| Permission | Justification |
|---|---|
| `declarativeNetRequestWithHostAccess` | Redirects responses whose Content-Type is application/pdf to the extension's bundled PDF viewer, so PDF links open in dark mode. Rules match PDF responses only, skip POST requests and download links, and can be turned off in the popup. |
| `storage` | Saves the user's display preferences (theme, image mode, contrast, auto-open on/off). |
| Host permission `<all_urls>` (optional) | Requested at runtime only after the user clicks "Allow access". Needed to fetch the PDF the user opened from whichever site hosts it, and for the redirect rule to act on that site. The extension does not read or change any web page; it has no content scripts. |

**Remote code:** No, I am not using remote code. All JavaScript, including PDF.js, is bundled in the package.

**Data usage:** check none of the data types. The extension does not collect or transmit user data.
Certify the three disclosures (no selling, no unrelated use, no creditworthiness use).

**Privacy policy URL:** host `docs/PRIVACY.md` publicly (GitHub Pages, a public Gist, or your site) and paste the URL.

## Notes for the reviewer (optional field)

```
To test: install, click "Allow access" on the welcome page, then open any PDF link, e.g.
https://arxiv.org/pdf/1706.03762 . It opens in the extension's viewer in dark mode. Press D to
compare with the original colors. Local files: use the folder button in the viewer toolbar.
The welcome page also has a bundled sample PDF that needs no permissions.
```
