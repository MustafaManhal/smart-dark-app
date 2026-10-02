import { expect, test } from "vitest";
import { parseHash } from "../../app/src/router";

test("parses library and reader routes", () => {
  expect(parseHash("")).toEqual({ name: "library" });
  expect(parseHash("#/")).toEqual({ name: "library" });
  expect(parseHash("#/read/abc-123")).toEqual({ name: "reader", bookId: "abc-123" });
  expect(parseHash("#/nonsense")).toEqual({ name: "library" });
});
