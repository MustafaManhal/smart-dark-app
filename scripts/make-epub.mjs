// Writes the e-books the tests read: test/fixtures/sample.epub (English, three chapters, a cover,
// nested contents), arabic.epub (right to left) and scripted.epub (a book that tries to run a script).
// Run: node scripts/make-epub.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { encodePng } from "./png.mjs";

const out = fileURLToPath(new URL("../test/fixtures/", import.meta.url));
mkdirSync(out, { recursive: true });

// A cover of two colors, so a test can tell it from an empty picture.
function cover(top, bottom) {
  const w = 120, h = 180, rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgba.set([...(y < h * 0.6 ? top : bottom), 255], (y * w + x) * 4);
  return encodePng(w, h, rgba, { alpha: false });
}

const page = (title, body, { lang = "en", dir = "ltr" } = {}) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}" dir="${dir}">
<head><title>${title}</title><link rel="stylesheet" href="style.css"/></head>
<body>
${body}
</body>
</html>`;

function epub({ title, author, lang, dir, chapters, coverColors, id }) {
  const files = {
    // The mimetype file comes first and is stored, not compressed: the format asks for it.
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
    "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
    "OEBPS/style.css": strToU8("body { font-family: serif; line-height: 1.5; } h1 { color: #1a4fa0; } .note { color: #a02020; }"),
    "OEBPS/cover.png": [cover(...coverColors), { level: 0 }],
  };
  chapters.forEach((chapter, i) => {
    files[`OEBPS/ch${i + 1}.xhtml`] = strToU8(page(chapter.title, chapter.body, { lang, dir }));
  });
  files["OEBPS/nav.xhtml"] = strToU8(page("Contents", `<nav epub:type="toc"><h1>Contents</h1><ol>
${chapters.map((c, i) => `  <li><a href="ch${i + 1}.xhtml">${c.title}</a>${c.sub ? `<ol><li><a href="ch${i + 1}.xhtml#${c.sub.id}">${c.sub.title}</a></li></ol>` : ""}</li>`).join("\n")}
</ol></nav>`, { lang, dir }));
  files["OEBPS/content.opf"] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">${id}</dc:identifier>
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    <dc:language>${lang}</dc:language>
    <meta property="dcterms:modified">2026-10-07T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>
${chapters.map((_, i) => `    <item id="ch${i + 1}" href="ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
  </manifest>
  <spine${dir === "rtl" ? ' page-progression-direction="rtl"' : ""}>
${chapters.map((_, i) => `    <itemref idref="ch${i + 1}"/>`).join("\n")}
  </spine>
</package>`);
  return zipSync(files);
}

const filler = (n, words) => Array.from({ length: n }, (_, i) => `<p>Paragraph ${i + 1}. ${words}</p>`).join("\n");
const lorem = "The lighthouse keeper counted the ships each evening and wrote their names in a ledger with a green cover. Some nights there were none, and he wrote that down as well.";

writeFileSync(`${out}sample.epub`, epub({
  id: "urn:uuid:5f0c2b1e-2a4d-4d0b-9c33-reader343epub",
  title: "The Lighthouse Ledger", author: "Mara Quill", lang: "en", dir: "ltr", coverColors: [[26, 79, 160], [240, 236, 226]],
  chapters: [
    { title: "One: The Keeper", body: `<h1>One: The Keeper</h1>\n<p>The first chapter opens with a walrus on the rocks.</p>\n${filler(30, lorem)}` },
    { title: "Two: The Storm", sub: { id: "calm", title: "After the storm" },
      body: `<h1>Two: The Storm</h1>\n<p class="note">A red note: the barometer fell all afternoon.</p>\n${filler(18, lorem)}\n<h2 id="calm">After the storm</h2>\n<p>The sea was flat as a plate, and a single zeppelin crossed the sky.</p>\n${filler(12, lorem)}` },
    { title: "Three: The Ledger", body: `<h1>Three: The Ledger</h1>\n<p>The last chapter closes the green ledger.</p>\n${filler(10, lorem)}\n<p>The end.</p>` },
  ],
}));

// A book that tries to run a script: the reader must show its words and run nothing.
writeFileSync(`${out}scripted.epub`, epub({
  id: "urn:uuid:c0ffee00-1111-4222-8333-reader343scri",
  title: "A Book With a Script", author: "Nobody", lang: "en", dir: "ltr", coverColors: [[160, 32, 32], [240, 236, 226]],
  chapters: [
    { title: "Only chapter", body: `<h1>Only chapter</h1>\n<p id="words">These words are harmless.</p>
<script>document.getElementById("words").textContent = "The script ran."; window.top.scriptRan = true;</script>
<p><img src="missing.png" alt="" onerror="window.top.scriptRan = true"/></p>` },
  ],
}));

const arabic = "كان حارس الفنار يعدّ السفن كل مساء ويكتب أسماءها في دفتر أخضر. وفي بعض الليالي لم تمرّ أي سفينة، فكان يكتب ذلك أيضًا.";
writeFileSync(`${out}arabic.epub`, epub({
  id: "urn:uuid:9a1d7c55-6e0f-4b7a-8f21-reader343arab",
  title: "دفتر الفنار", author: "مارا كويل", lang: "ar", dir: "rtl", coverColors: [[31, 120, 88], [240, 236, 226]],
  chapters: [
    { title: "الفصل الأول", body: `<h1>الفصل الأول</h1>\n<p>يبدأ الفصل الأول بفقمة على الصخور.</p>\n${Array.from({ length: 24 }, () => `<p>${arabic}</p>`).join("\n")}` },
    { title: "الفصل الثاني", body: `<h1>الفصل الثاني</h1>\n<p>هدأ البحر بعد العاصفة.</p>\n${Array.from({ length: 12 }, () => `<p>${arabic}</p>`).join("\n")}` },
  ],
}));
console.log(`wrote sample.epub, arabic.epub and scripted.epub to ${out}`);
