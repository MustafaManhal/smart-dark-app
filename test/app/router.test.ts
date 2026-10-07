import { expect, test } from "vitest";
import { hashFor, parseHash } from "../../app/src/router";

test("parses library and reader routes", () => {
  expect(parseHash("")).toEqual({ name: "library" });
  expect(parseHash("#/")).toEqual({ name: "library" });
  expect(parseHash("#/read/abc-123")).toEqual({ name: "reader", bookId: "abc-123" });
  expect(parseHash("#/read/abc-123?p=7")).toEqual({ name: "reader", bookId: "abc-123", page: 7 });
  expect(parseHash("#/stats")).toEqual({ name: "stats" });
  expect(parseHash("#/settings")).toEqual({ name: "settings" });
  expect(parseHash("#/nonsense")).toEqual({ name: "library" });
});

test("hashFor is the inverse of parseHash", () => {
  for (const r of [{ name: "library" }, { name: "reader", bookId: "x" }, { name: "reader", bookId: "x", page: 4 }, { name: "stats" }, { name: "settings" }] as const) {
    expect(parseHash(hashFor(r))).toEqual(r);
  }
});

test("a reader route can carry words to look for", () => {
  const route = { name: "reader", bookId: "x", page: 4, find: "red & blue = 50% résumé" } as const;
  expect(hashFor(route)).toBe("#/read/x?p=4&q=red%20%26%20blue%20%3D%2050%25%20r%C3%A9sum%C3%A9");
  expect(parseHash(hashFor(route))).toEqual(route);
  expect(parseHash(hashFor({ name: "reader", bookId: "x", find: "قراءة" }))).toEqual({ name: "reader", bookId: "x", find: "قراءة" });
  expect(parseHash("#/read/x?q=%20%20")).toEqual({ name: "reader", bookId: "x" });
  expect(parseHash("#/read/x?p=abc")).toEqual({ name: "reader", bookId: "x" });
});

test("a reader route can ask for the tour", () => {
  expect(hashFor({ name: "reader", bookId: "x", tour: true })).toBe("#/read/x?tour=1");
  expect(parseHash("#/read/x?tour=1")).toEqual({ name: "reader", bookId: "x", tour: true });
  expect(parseHash("#/read/x?tour=0")).toEqual({ name: "reader", bookId: "x" });
});
