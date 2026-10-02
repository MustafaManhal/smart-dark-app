import { expect, test } from "vitest";
import { hashFor, parseHash } from "../../app/src/router";

test("parses library and reader routes", () => {
  expect(parseHash("")).toEqual({ name: "library" });
  expect(parseHash("#/")).toEqual({ name: "library" });
  expect(parseHash("#/read/abc-123")).toEqual({ name: "reader", bookId: "abc-123" });
  expect(parseHash("#/read/abc-123?p=7")).toEqual({ name: "reader", bookId: "abc-123", page: 7 });
  expect(parseHash("#/nonsense")).toEqual({ name: "library" });
});

test("hashFor is the inverse of parseHash", () => {
  for (const r of [{ name: "library" }, { name: "reader", bookId: "x" }, { name: "reader", bookId: "x", page: 4 }] as const) {
    expect(parseHash(hashFor(r))).toEqual(r);
  }
});
