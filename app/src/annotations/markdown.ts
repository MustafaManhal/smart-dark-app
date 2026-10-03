import type { BookAnnotations } from "../db/annotations";
import { t } from "../i18n/i18n";
import { noteItems } from "./noteItems";

/** A readable Markdown export of one book's highlights, notes, sticky notes and bookmarks. */
export function notesToMarkdown(title: string, data: BookAnnotations): string {
  const all = { kind: "highlights" as const, color: null, query: "" };
  const lines = [`# ${title}`, ""];
  const section = (heading: string, entries: string[]) => {
    if (!entries.length) return;
    lines.push(`## ${heading}`, "", ...entries, "");
  };
  section(t("Highlights"), noteItems(data, all).map((e) => `- ${t("p. {n}", { n: e.page })}: “${(e.item as { text: string }).text}”`));
  section(t("Notes"), noteItems(data, { ...all, kind: "notes" }).flatMap((e) => {
    const n = e.item as { text: string; body: string };
    return [`### ${t("Page {page}", { page: e.page })}`, "", `> ${n.text}`, "", n.body.trim(), ""];
  }));
  section(t("Sticky notes"), noteItems(data, { ...all, kind: "sticky" }).map((e) => `- ${t("p. {n}", { n: e.page })}: ${(e.item as { text: string }).text.trim() || t("(empty)")}`));
  section(t("Bookmarks"), noteItems(data, { ...all, kind: "bookmarks" }).map((e) => `- ${t("Page {page}", { page: e.page })}`));
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
