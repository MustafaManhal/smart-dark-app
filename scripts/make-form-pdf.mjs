// Builds test/fixtures/form.pdf: one page with a form (two text fields, a checkbox, a choice).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";

const doc = await PDFDocument.create();
doc.setTitle("Form sample");
const font = await doc.embedFont(StandardFonts.Helvetica);
const page = doc.addPage([595, 842]);
page.drawText("Library card request", { x: 60, y: 760, size: 22, font });
const form = doc.getForm();
const label = (text, y) => page.drawText(text, { x: 60, y, size: 12, font });
label("Full name", 700);
form.createTextField("name").addToPage(page, { x: 160, y: 690, width: 300, height: 26 });
label("City", 650);
form.createTextField("city").addToPage(page, { x: 160, y: 640, width: 300, height: 26 });
label("Send news", 600);
form.createCheckBox("news").addToPage(page, { x: 160, y: 594, width: 18, height: 18 });
label("Card type", 550);
const kind = form.createDropdown("kind");
kind.addOptions(["Student", "Adult", "Senior"]);
kind.select("Adult");
kind.addToPage(page, { x: 160, y: 540, width: 160, height: 24 });
const out = fileURLToPath(new URL("../test/fixtures/form.pdf", import.meta.url));
writeFileSync(out, await doc.save());
console.log(`wrote ${out}`);

// ---- headings.pdf: a short book with chapter and section headings but no table of contents inside the file.
{
  const book = await PDFDocument.create();
  book.setTitle("Headings sample");
  const regular = await book.embedFont(StandardFonts.Helvetica);
  const bold = await book.embedFont(StandardFonts.HelveticaBold);
  const body = "Plain body text that fills the line from one margin to the other, as a paragraph does.";
  const pages = [
    [["A Short Guide to Tides", 26, bold], ["1 Why the sea moves", 18, bold], "p", "p", ["1.1 The pull of the moon", 14, bold], "p", "p", "p"],
    ["p", "p", ["1.2 Spring and neap tides", 14, bold], "p", "p", "p", "p"],
    [["2 Reading a tide table", 18, bold], "p", "p", ["2.1 High and low water", 14, bold], "p", "p"],
  ];
  pages.forEach((lines, index) => {
    const page = book.addPage([595, 842]);
    // A running header and a page number: on every page, and not headings.
    page.drawText("A Short Guide to Tides", { x: 60, y: 800, size: 9, font: regular });
    page.drawText(String(index + 1), { x: 290, y: 40, size: 9, font: regular });
    let y = 740;
    for (const line of lines) {
      if (line === "p") {
        for (let i = 0; i < 3; i++) page.drawText(body, { x: 60, y: (y -= 16), size: 11, font: regular });
        y -= 12;
      } else {
        const [text, size, font] = line;
        page.drawText(text, { x: 60, y: (y -= size + 14), size, font });
        y -= 8;
      }
    }
  });
  const file = fileURLToPath(new URL("../test/fixtures/headings.pdf", import.meta.url));
  writeFileSync(file, await book.save());
  console.log(`wrote ${file}`);
}
