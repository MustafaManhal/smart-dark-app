# Microsoft Edge Add-ons

Partner Center: https://partner.microsoft.com/dashboard/microsoftedge/public/login (registration is free).
Upload `reader343-extension-<version>.zip`, the same file as for the Chrome Web Store. Edge runs Chrome
extensions as they are. Review can take up to seven business days.

Source for the field list and limits:
https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension

## Availability

- **Visibility:** Public
- **Markets:** all

## Properties

- **Category:** Productivity
- **Website:** https://smart-dark-app.vercel.app/about/
- **Support contact detail:** https://github.com/MustafaManhal/smart-dark-app/issues
- **Mature content:** no

## Privacy

**Single purpose description:**

```
Display PDF documents in a readable dark theme that keeps the document's colors and photos.
```

**Permission justifications:**

| Permission | Justification |
|---|---|
| `declarativeNetRequestWithHostAccess` | Redirects responses whose Content-Type is application/pdf to the extension's bundled PDF viewer, so PDF links open in dark mode. Rules match PDF responses only, skip POST requests and download links, and can be turned off in the popup. |
| `storage` | Saves the user's display preferences (theme, image mode, contrast, auto-open on or off). |
| Host permission `<all_urls>` (optional) | Requested at runtime only after the user clicks "Allow access". Needed to fetch the PDF the user opened from whichever site hosts it, and for the redirect rule to act on that site. The extension does not read or change any web page; it has no content scripts. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** tick none of the data types. Tick the certifications.

**Privacy policy URL:** https://smart-dark-app.vercel.app/about/privacy.html

## Store listing (English)

**Extension name** and **Short description** come from the manifest and cannot be edited here.

**Description** (250 to 10,000 characters): use the description block from
[chrome-web-store.md](chrome-web-store.md).

**Extension logo** (300x300): `store/logo-300.png`

**Small promotional tile** (440x280): `store/promo-small-440x280.jpg`

**Screenshots** (1280x800, six at most): the three `store/screenshot-*.jpg` files.

**Search terms** (seven terms at most, 30 characters each, 21 words in all):

```
dark mode pdf
pdf reader
night mode pdf
pdf viewer dark
smart invert
dark pdf
read pdf at night
```

## Notes for certification

```
To test: install, click "Allow access" on the welcome page, then open any PDF link, for example
https://arxiv.org/pdf/1706.03762 . It opens in the extension's viewer in dark mode. Press D to
compare with the original colors. Local files: use the folder button in the viewer toolbar.
The welcome page also has a bundled sample PDF that needs no permissions.
The same package is published in the Chrome Web Store.
```

Leave the last line out if the Chrome listing is not live yet.
