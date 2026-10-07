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
