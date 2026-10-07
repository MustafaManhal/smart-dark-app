import { signal } from "@preact/signals";

/** `find`: words to look for when the book opens (from a search across the library). `tour`: show the three-step tour. */
export type Route = { name: "library" } | { name: "stats" } | { name: "settings" } | { name: "notebook" } | { name: "review" } | { name: "tools"; bookId?: string } | { name: "reader"; bookId: string; page?: number; find?: string; tour?: true };

export function parseHash(hash: string): Route {
  const read = /^#\/read\/([\w-]+)(?:\?(.*))?$/.exec(hash);
  if (read) {
    const params = new URLSearchParams(read[2] ?? "");
    const page = /^\d+$/.test(params.get("p") ?? "") ? Number(params.get("p")) : 0;
    const find = params.get("q")?.trim();
    return { name: "reader", bookId: read[1], ...(page ? { page } : {}), ...(find ? { find } : {}), ...(params.get("tour") === "1" ? { tour: true } : {}) };
  }
  if (hash === "#/stats") return { name: "stats" };
  if (hash === "#/settings") return { name: "settings" };
  if (hash === "#/notes") return { name: "notebook" };
  if (hash === "#/review") return { name: "review" };
  const tools = /^#\/tools(?:\/([\w-]+))?$/.exec(hash);
  if (tools) return { name: "tools", ...(tools[1] ? { bookId: tools[1] } : {}) };
  return { name: "library" };
}

export function hashFor(to: Route): string {
  if (to.name === "reader") {
    const params = [to.page ? `p=${to.page}` : "", to.find ? `q=${encodeURIComponent(to.find)}` : "", to.tour ? "tour=1" : ""].filter(Boolean).join("&");
    return `#/read/${to.bookId}${params ? `?${params}` : ""}`;
  }
  if (to.name === "stats") return "#/stats";
  if (to.name === "settings") return "#/settings";
  if (to.name === "notebook") return "#/notes";
  if (to.name === "review") return "#/review";
  if (to.name === "tools") return to.bookId ? `#/tools/${to.bookId}` : "#/tools";
  return "#/";
}

export const route = signal<Route>(parseHash(location.hash));

export function navigate(to: Route) {
  location.hash = hashFor(to);
}

addEventListener("hashchange", () => {
  route.value = parseHash(location.hash);
});
