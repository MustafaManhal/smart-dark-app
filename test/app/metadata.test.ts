// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { parseGoogleBooks, parseOpenLibrary, searchBooks } from "../../app/src/metadata/lookup";

const ol = JSON.parse(readFileSync("test/app/fixtures/openlibrary-hobbit.json", "utf8"));
const gb = JSON.parse(readFileSync("test/app/fixtures/googlebooks-sample.json", "utf8"));

test("parses Open Library results with cover URLs", () => {
  const r = parseOpenLibrary(ol);
  expect(r[0]).toEqual({
    source: "Open Library", title: "The Hobbit", author: "J.R.R. Tolkien", year: 1937,
    coverUrl: "https://covers.openlibrary.org/b/id/14627509-L.jpg?default=false",
  });
});

test("parses Google Books results, upgrading cover links to https and skipping empty items", () => {
  const r = parseGoogleBooks(gb);
  expect(r).toHaveLength(1);
  expect(r[0]).toMatchObject({ source: "Google Books", title: "The Hobbit: Or There and Back Again", author: "J.R.R. Tolkien", year: 2012 });
  expect(r[0].coverUrl).toMatch(/^https:\/\/books\.google\.com\/.*&img=1/);
  expect(r[0].coverUrl).not.toContain("edge=curl");
});

afterEach(() => vi.unstubAllGlobals());

test("search uses Open Library first and still works when Google Books is rate limited", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (url.includes("openlibrary.org")) return new Response(JSON.stringify(ol));
    return new Response("{}", { status: 429 });
  });
  const results = await searchBooks("The Hobbit");
  expect(calls[0]).toContain("openlibrary.org/search.json?q=The+Hobbit");
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((r) => r.source === "Open Library")).toBe(true);
});

test("search reports when no source could be reached", async () => {
  vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
  await expect(searchBooks("x")).rejects.toThrow("Book details could not be reached. Check your connection.");
});
