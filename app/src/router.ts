import { signal } from "@preact/signals";

export type Route = { name: "library" } | { name: "reader"; bookId: string };

export function parseHash(hash: string): Route {
  const match = /^#\/read\/([\w-]+)$/.exec(hash);
  return match ? { name: "reader", bookId: match[1] } : { name: "library" };
}

export const route = signal<Route>(parseHash(location.hash));

export function navigate(to: Route) {
  location.hash = to.name === "reader" ? `#/read/${to.bookId}` : "#/";
}

addEventListener("hashchange", () => {
  route.value = parseHash(location.hash);
});
