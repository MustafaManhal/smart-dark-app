// @vitest-environment node
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { openPdf } from "../../app/src/reader/pdf";
import { buildPdf, jpegTurn, moveBefore, movePicks, pagesOf, sizeText, splitPicks, suggestName, turnPicks, type PagePick, type Source } from "../../app/src/tools/pdfTools";

const pdf = (id: string, path: string, pageCount: number): Source => ({ id, name: `${id}.pdf`, kind: "pdf", bytes: new Uint8Array(readFileSync(path)), pageCount });
const sample = () => pdf("sample", "src/sample/sample.pdf", 2);
const links = () => pdf("links", "test/fixtures/links.pdf", 3);

/** A tiny PNG of one color, made by hand. */
function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    let crc = ~0;
    for (const byte of body) {
      crc ^= byte;
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    const head = Buffer.alloc(4); head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(~crc >>> 0);
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 200)]);
  const data = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", data), chunk("IEND", Buffer.alloc(0))]));
}

const firstWords = async (bytes: Uint8Array, n: number) => {
  const doc = await openPdf(bytes.slice());
  const items = (await (await doc.getPage(n)).getTextContent()).items as { str: string }[];
  return items.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim().slice(0, 24);
};

test("pages are picked, moved and turned without touching the others", () => {
  const picks = pagesOf(links());
  expect(picks.map((p) => p.key)).toEqual(["links:0", "links:1", "links:2"]);
  const keys = (list: PagePick[]) => list.map((p) => p.index).join("");
  expect(keys(movePicks(picks, new Set(["links:2"]), -1))).toBe("021");
  expect(keys(movePicks(picks, new Set(["links:0", "links:1"]), 1))).toBe("201"); // two together keep their order
  expect(keys(movePicks(picks, new Set(["links:0"]), -1))).toBe("012"); // already first
  const turned = turnPicks(picks, new Set(["links:1"]), -90);
  expect(turned.map((p) => p.turn)).toEqual([0, 270, 0]);
  expect(turnPicks(turned, new Set(["links:1"]), 90)[1].turn).toBe(0);
});

test("two books are merged, with pages in the chosen order", async () => {
  const sources = [sample(), links()];
  // page 3 of the links book first, then both pages of the sample, then page 1 of the links book
  const picks = [pagesOf(sources[1])[2], ...pagesOf(sources[0]), pagesOf(sources[1])[0]];
  const out = await buildPdf(sources, picks, "Merged");
  const doc = await openPdf(out.slice());
  expect(doc.numPages).toBe(4);
  expect((await doc.getMetadata()).info).toMatchObject({ Title: "Merged" });
  expect(await firstWords(out, 1)).toContain("Chapter three");
  expect(await firstWords(out, 2)).toContain("Quarterly Reading Report");
  expect(await firstWords(out, 4)).toContain("Links sample");
});

test("a page is turned, a page is left out, and a protected book needs its password", async () => {
  const source = links();
  const picks = turnPicks(pagesOf(source).filter((p) => p.index !== 1), new Set(["links:2"]), 90);
  const doc = await openPdf((await buildPdf([source], picks, "Split")).slice());
  expect(doc.numPages).toBe(2);
  expect((await doc.getPage(1)).rotate).toBe(0);
  expect((await doc.getPage(2)).rotate).toBe(90);

  const locked: Source = { id: "locked", name: "locked.pdf", kind: "pdf", bytes: new Uint8Array(readFileSync("test/fixtures/locked.pdf")), pageCount: 2 };
  await expect(buildPdf([locked], pagesOf(locked), "x")).rejects.toThrow();
  const open = await openPdf((await buildPdf([{ ...locked, password: "open sesame" }], pagesOf(locked), "Unlocked")).slice());
  expect(open.numPages).toBe(2);
});

test("pictures become pages of their own shape, no larger than a sheet of paper", async () => {
  const wide: Source = { id: "wide", name: "wide.png", kind: "image", type: "image/png", bytes: png(200, 100), pageCount: 1 };
  const huge: Source = { id: "huge", name: "huge.png", kind: "image", type: "image/png", bytes: png(60, 3000), pageCount: 1 };
  const doc = await openPdf((await buildPdf([wide, huge], [...pagesOf(wide), ...pagesOf(huge)], "Pictures")).slice());
  expect(doc.numPages).toBe(2);
  const first = (await doc.getPage(1)).getViewport({ scale: 1 });
  expect([first.width, first.height]).toEqual([200, 100]);
  const second = (await doc.getPage(2)).getViewport({ scale: 1 });
  expect(second.height).toBeCloseTo(842, 0);
  expect(second.width).toBeCloseTo(60 * (842 / 3000), 1);
});

test("pages are dropped in front of another page, and cut into parts", () => {
  const picks = pagesOf(links()).concat(pagesOf(sample()));
  const keys = (list: PagePick[]) => list.map((p) => p.key.replace(/^(\w)\w+:/, "$1")).join(" ");
  expect(keys(picks)).toBe("l0 l1 l2 s0 s1");
  expect(keys(moveBefore(picks, new Set(["sample:0", "links:2"]), "links:0"))).toBe("l2 s0 l0 l1 s1");
  expect(keys(moveBefore(picks, new Set(["links:0"]), null))).toBe("l1 l2 s0 s1 l0");
  expect(moveBefore(picks, new Set(["links:0"]), "links:0")).toBe(picks); // dropped on itself
  expect(splitPicks(picks, 2).map((part) => part.length)).toEqual([2, 2, 1]);
  expect(splitPicks(picks, 0).length).toBe(5);
  expect(splitPicks(picks, 9).length).toBe(1);
});

test("a photo taken upright is turned upright", () => {
  // A JPEG start, then the camera's note with orientation 6 (the picture lies on its side), little-endian.
  const exif = (orientation: number, little: boolean) => {
    const u16 = (v: number) => (little ? [v & 255, v >> 8] : [v >> 8, v & 255]);
    const u32 = (v: number) => (little ? [v & 255, 0, 0, 0] : [0, 0, 0, v & 255]);
    const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
    const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255, ...body, 0xff, 0xda, 0, 2]);
  };
  expect(jpegTurn(exif(6, true))).toBe(90);
  expect(jpegTurn(exif(8, false))).toBe(270);
  expect(jpegTurn(exif(3, true))).toBe(180);
  expect(jpegTurn(exif(1, true))).toBe(0);
  expect(jpegTurn(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBe(0);
  expect(jpegTurn(png(4, 4))).toBe(0);
  const photo: Source = { id: "photo", name: "photo.jpg", kind: "image", type: "image/jpeg", bytes: exif(6, true), pageCount: 1 };
  expect(pagesOf(photo)[0].turn).toBe(90);
});

test("sizes read as words", () => {
  expect(sizeText(300)).toBe("1 KB");
  expect(sizeText(655_360)).toBe("640 KB");
  expect(sizeText(1_258_291)).toBe("1.2 MB");
  expect(sizeText(52_428_800)).toBe("50 MB");
});

test("the new PDF gets a name from what goes into it", () => {
  expect(suggestName([sample()])).toBe("sample (pages)");
  expect(suggestName([sample(), links()])).toBe("sample + links");
  expect(suggestName([sample(), links(), sample(), links()])).toBe("sample + links + 2");
});
