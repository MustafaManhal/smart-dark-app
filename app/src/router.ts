import { signal } from "@preact/signals";

export type Route =
  | { name: "library" }
  | { name: "reader"; bookId: string; page?: number }
  | { name: "notes"; bookId: string };

export function parseHash(hash: string): Route {
  const read = /^#\/read\/([\w-]+)(?:\?p=(\d+))?$/.exec(hash);
  if (read) return read[2] ? { name: "reader", bookId: read[1], page: Number(read[2]) } : { name: "reader", bookId: read[1] };
  const notes = /^#\/notes\/([\w-]+)$/.exec(hash);
  if (notes) return { name: "notes", bookId: notes[1] };
  return { name: "library" };
}

export function hashFor(to: Route): string {
  if (to.name === "reader") return `#/read/${to.bookId}${to.page ? `?p=${to.page}` : ""}`;
  if (to.name === "notes") return `#/notes/${to.bookId}`;
  return "#/";
}

export const route = signal<Route>(parseHash(location.hash));

export function navigate(to: Route) {
  location.hash = hashFor(to);
}

addEventListener("hashchange", () => {
  route.value = parseHash(location.hash);
});
