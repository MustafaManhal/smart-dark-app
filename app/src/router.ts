import { signal } from "@preact/signals";

/** `find`: words to look for when the book opens (from a search across the library). */
export type Route = { name: "library" } | { name: "stats" } | { name: "settings" } | { name: "reader"; bookId: string; page?: number; find?: string };

export function parseHash(hash: string): Route {
  const read = /^#\/read\/([\w-]+)(?:\?(.*))?$/.exec(hash);
  if (read) {
    const params = new URLSearchParams(read[2] ?? "");
    const page = /^\d+$/.test(params.get("p") ?? "") ? Number(params.get("p")) : 0;
    const find = params.get("q")?.trim();
    return { name: "reader", bookId: read[1], ...(page ? { page } : {}), ...(find ? { find } : {}) };
  }
  if (hash === "#/stats") return { name: "stats" };
  if (hash === "#/settings") return { name: "settings" };
  return { name: "library" };
}

export function hashFor(to: Route): string {
  if (to.name === "reader") {
    const params = [to.page ? `p=${to.page}` : "", to.find ? `q=${encodeURIComponent(to.find)}` : ""].filter(Boolean).join("&");
    return `#/read/${to.bookId}${params ? `?${params}` : ""}`;
  }
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
