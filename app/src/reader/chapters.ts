import type { OutlineItem } from "./pdf";

// Chapters are the top-level outline entries, in page order.
function chapters(outline: OutlineItem[]) {
  return outline.filter((o) => o.depth === 0).sort((a, b) => a.page - b.page);
}

export function currentChapter(outline: OutlineItem[], page: number, pageCount: number) {
  const list = chapters(outline);
  let index = -1;
  for (let i = 0; i < list.length; i++) if (list[i].page <= page) index = i;
  if (index < 0) return null;
  const startPage = list[index].page;
  const next = list.slice(index + 1).find((c) => c.page > startPage);
  const endPage = next ? next.page - 1 : pageCount;
  return { item: list[index], index, startPage, endPage };
}

export function chapterProgress(outline: OutlineItem[], page: number, pageCount: number): number | null {
  const chapter = currentChapter(outline, page, pageCount);
  if (!chapter) return null;
  const length = chapter.endPage - chapter.startPage + 1;
  return Math.min(1, (page - chapter.startPage + 1) / length);
}
