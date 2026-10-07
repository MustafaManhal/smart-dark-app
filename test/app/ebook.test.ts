// @vitest-environment node
import { expect, test } from "vitest";
import { ebookFormat, plainText } from "../../app/src/ebook/importEbook";
import { bookStyles, tocList } from "../../app/src/ebook/look";
import { isEbook } from "../../app/src/db/repos";
import { percentRead } from "../../app/src/library/filters";

test("titles and authors are read in whatever shape a book gives them", () => {
  expect(plainText("  The Ledger ")).toBe("The Ledger");
  expect(plainText({ en: "The Ledger", fr: "Le Registre" })).toBe("The Ledger");
  expect(plainText([{ name: "Mara Quill" }, { name: { en: "Ben Oar" } }, "Third"])).toBe("Mara Quill, Ben Oar, Third");
  expect(plainText(undefined)).toBe("");
  expect(plainText(null)).toBe("");
});

test("the kind of e-book is told from how the file starts and what it is called", () => {
  const zip = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]);
  expect(ebookFormat("book.epub", zip)).toBe("epub");
  expect(ebookFormat("no extension", zip)).toBe("epub");
  expect(ebookFormat("Comic.CBZ", zip)).toBe("cbz");
  expect(ebookFormat("story.fb2.zip", zip)).toBe("fb2");
  const mobi = new Uint8Array(80);
  mobi.set(new TextEncoder().encode("BOOKMOBI"), 60);
  expect(ebookFormat("book.azw3", mobi)).toBe("mobi");
  expect(ebookFormat("story.fb2", new TextEncoder().encode("<?xml version='1.0'?><FictionBook>"))).toBe("fb2");
  expect(ebookFormat("notes.txt", new TextEncoder().encode("hello"))).toBeNull();
  expect(ebookFormat("fake.epub", new TextEncoder().encode("hello"))).toBeNull();
});

test("a book without a format is a PDF", () => {
  expect(isEbook({})).toBe(false);
  expect(isEbook({ format: "pdf" })).toBe(false);
  expect(isEbook({ format: "epub" })).toBe(true);
});

test("an e-book's progress is how far through the text the reader is", () => {
  const book = { pageCount: 4, finishedAt: null } as never;
  expect(percentRead(book, { bookId: "b", page: 1, offset: 0, updatedAt: 1, cfi: "epubcfi(/6/2)", fraction: 0.62 })).toBe(62);
  expect(percentRead(book, { bookId: "b", page: 2, offset: 0, updatedAt: 1 })).toBe(50); // a PDF: by page
});

test("the contents become one list that keeps how deep each entry sits", () => {
  const toc = [
    { label: " One ", href: "ch1.xhtml" },
    { label: "Two", href: "ch2.xhtml", subitems: [{ label: "Two, later", href: "ch2.xhtml#later", subitems: [{ label: "Deep", href: "ch2.xhtml#deep" }] }] },
    { label: "No address" },
  ];
  expect(tocList(toc)).toEqual([
    { label: "One", href: "ch1.xhtml", depth: 0 },
    { label: "Two", href: "ch2.xhtml", depth: 0 },
    { label: "Two, later", href: "ch2.xhtml#later", depth: 1 },
    { label: "Deep", href: "ch2.xhtml#deep", depth: 2 },
  ]);
  expect(tocList(undefined)).toEqual([]);
});

test("smart dark gives the book the theme's colors as seen through the inverting filter", () => {
  const dark = bookStyles("dark", "dark", 110);
  // The Dark theme's paper is rgb(30 31 34): the page is given its opposite, which the filter turns back.
  expect(dark).toContain("background: rgb(225 224 221) !important");
  expect(dark).toContain("font-size: 110% !important");
  expect(dark).toContain("img, svg image, video, canvas { filter: invert(1) hue-rotate(180deg); }");
  const sepia = bookStyles("sepia", "dark", 100);
  expect(sepia).toContain("background: rgb(244 236 216) !important");
  expect(sepia).not.toContain("invert");
  expect(bookStyles("original", "dark", 100)).toContain("background: #ffffff");
});
