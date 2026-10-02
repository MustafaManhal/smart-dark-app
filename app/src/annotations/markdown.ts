import type { BookAnnotations } from "../db/annotations";
import { noteItems } from "./noteItems";

/** A readable Markdown export of one book's highlights, notes, sticky notes and bookmarks. */
export function notesToMarkdown(title: string, data: BookAnnotations): string {
  const all = { kind: "highlights" as const, color: null, query: "" };
  const lines = [`# ${title}`, ""];
  const section = (heading: string, entries: string[]) => {
    if (!entries.length) return;
    lines.push(`## ${heading}`, "", ...entries, "");
  };
  section("Highlights", noteItems(data, all).map((e) => `- p. ${e.page}: “${(e.item as { text: string }).text}”`));
  section("Notes", noteItems(data, { ...all, kind: "notes" }).flatMap((e) => {
    const n = e.item as { text: string; body: string };
    return [`### Page ${e.page}`, "", `> ${n.text}`, "", n.body.trim(), ""];
  }));
  section("Sticky notes", noteItems(data, { ...all, kind: "sticky" }).map((e) => `- p. ${e.page}: ${(e.item as { text: string }).text.trim() || "(empty)"}`));
  section("Bookmarks", noteItems(data, { ...all, kind: "bookmarks" }).map((e) => `- Page ${e.page}`));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
