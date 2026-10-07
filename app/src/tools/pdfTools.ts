/**
 * Making a new PDF out of pages: of one book (split, reorder, turn, drop
 * pages), of several (merge), or of pictures. Everything happens on this
 * device with pdf-lib, which is loaded only when a PDF is made.
 */

/** A file the new PDF takes pages from. A picture counts as a file with one page. */
export type Source = { id: string; name: string; kind: "pdf" | "image"; bytes: Uint8Array; type?: string; password?: string; pageCount: number };

/** One page of the new PDF: which page of which source, and how far it is turned (clockwise, on top of its own turn). */
export type PagePick = { key: string; source: string; index: number; turn: 0 | 90 | 180 | 270 };

/** Every page of a source, in order, as picks. */
export function pagesOf(source: Source): PagePick[] {
  const turn = source.kind === "image" && source.type !== "image/png" ? jpegTurn(source.bytes) : 0;
  return Array.from({ length: source.pageCount }, (_, index) => ({ key: `${source.id}:${index}`, source: source.id, index, turn }));
}

/** The picks with the chosen ones moved one place earlier (-1) or later (+1), keeping their order among themselves. */
export function movePicks(picks: PagePick[], chosen: Set<string>, by: -1 | 1): PagePick[] {
  const out = [...picks];
  const order = by === -1 ? out.keys() : [...out.keys()].reverse();
  for (const i of order) {
    const j = i + by;
    if (!chosen.has(out[i].key) || j < 0 || j >= out.length || chosen.has(out[j].key)) continue;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The picks with the chosen ones taken out and put back, in their order, in front of `before` (at the end without it). */
export function moveBefore(picks: PagePick[], chosen: Set<string>, before: string | null): PagePick[] {
  if (before && chosen.has(before)) return picks;
  const moving = picks.filter((p) => chosen.has(p.key));
  const rest = picks.filter((p) => !chosen.has(p.key));
  const at = before ? rest.findIndex((p) => p.key === before) : -1;
  return at < 0 ? [...rest, ...moving] : [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

/** The picks cut into parts of `size` pages, for one PDF each. The last part has what is left. */
export function splitPicks(picks: PagePick[], size: number): PagePick[][] {
  const step = Math.max(1, Math.floor(size) || 1);
  const parts: PagePick[][] = [];
  for (let i = 0; i < picks.length; i += step) parts.push(picks.slice(i, i + step));
  return parts;
}

/**
 * How far a photo must be turned to stand upright, from the note its camera left in it (EXIF orientation).
 * Phones store a portrait photo lying on its side with this note; a PDF page shows the picture as stored.
 */
export function jpegTurn(bytes: Uint8Array): PagePick["turn"] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 0;
  for (let at = 2; at + 4 <= view.byteLength; ) {
    const marker = view.getUint16(at), size = view.getUint16(at + 2);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 0; // the picture itself starts: no note before it
    if (marker === 0xffe1 && at + 18 <= view.byteLength && view.getUint32(at + 4) === 0x45786966) {
      const tiff = at + 10, little = view.getUint16(tiff) === 0x4949;
      const dir = tiff + view.getUint32(tiff + 4, little);
      if (dir + 2 > view.byteLength) return 0;
      const count = view.getUint16(dir, little);
      for (let i = 0; i < count; i++) {
        const entry = dir + 2 + i * 12;
        if (entry + 12 > view.byteLength) return 0;
        if (view.getUint16(entry, little) === 0x0112) return ({ 3: 180, 6: 90, 8: 270 } as Record<number, PagePick["turn"]>)[view.getUint16(entry + 8, little)] ?? 0;
      }
      return 0;
    }
    at += 2 + size;
  }
  return 0;
}

/** A file size in words: "640 KB", "1.2 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export const turnPicks = (picks: PagePick[], chosen: Set<string>, by: 90 | -90): PagePick[] =>
  picks.map((p) => (chosen.has(p.key) ? { ...p, turn: ((p.turn + by + 360) % 360) as PagePick["turn"] } : p));

/** Builds the new PDF: the picked pages, in their order. A picture becomes a page of its own size. */
export async function buildPdf(sources: Source[], picks: PagePick[], title: string): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await import("@cantoo/pdf-lib");
  const out = await PDFDocument.create();
  out.setTitle(title);
  out.setProducer("Reader343");
  const opened = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();
  const byId = new Map(sources.map((s) => [s.id, s]));
  for (const pick of picks) {
    const source = byId.get(pick.source);
    if (!source) continue;
    if (source.kind === "image") {
      const image = source.type === "image/png" ? await out.embedPng(source.bytes) : await out.embedJpg(source.bytes);
      // 72 dots an inch would make a phone photo a huge page: fit the longer side to an A4 sheet's.
      const scale = Math.min(1, 842 / Math.max(image.width, image.height));
      const page = out.addPage([image.width * scale, image.height * scale]);
      page.drawImage(image, { x: 0, y: 0, width: image.width * scale, height: image.height * scale });
      if (pick.turn) page.setRotation(degrees(pick.turn));
      continue;
    }
    let doc = opened.get(source.id);
    if (!doc) opened.set(source.id, (doc = await PDFDocument.load(source.bytes, { password: source.password, updateMetadata: false })));
    const [page] = await out.copyPages(doc, [pick.index]);
    if (pick.turn) page.setRotation(degrees((page.getRotation().angle + pick.turn) % 360));
    out.addPage(page);
  }
  return out.save({ useObjectStreams: true });
}

/** A name for the new PDF from what goes into it. */
export function suggestName(sources: Source[]): string {
  const names = sources.map((s) => s.name.replace(/\.(pdf|png|jpe?g)$/i, ""));
  if (names.length === 1) return `${names[0]} (pages)`;
  return names.slice(0, 2).join(" + ") + (names.length > 2 ? ` + ${names.length - 2}` : "");
}
