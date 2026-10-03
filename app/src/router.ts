import { signal } from "@preact/signals";

export type Route = { name: "library" } | { name: "stats" } | { name: "settings" } | { name: "reader"; bookId: string; page?: number };

export function parseHash(hash: string): Route {
  const read = /^#\/read\/([\w-]+)(?:\?p=(\d+))?$/.exec(hash);
  if (read) return read[2] ? { name: "reader", bookId: read[1], page: Number(read[2]) } : { name: "reader", bookId: read[1] };
  if (hash === "#/stats") return { name: "stats" };
  if (hash === "#/settings") return { name: "settings" };
  return { name: "library" };
}

export function hashFor(to: Route): string {
  if (to.name === "reader") return `#/read/${to.bookId}${to.page ? `?p=${to.page}` : ""}`;
  if (to.name === "stats") return "#/stats";
  if (to.name === "settings") return "#/settings";
  return "#/";
}

export const route = signal<Route>(parseHash(location.hash));

export function navigate(to: Route) {
  location.hash = hashFor(to);
}

addEventListener("hashchange", () => {
  route.value = parseHash(location.hash);
});
