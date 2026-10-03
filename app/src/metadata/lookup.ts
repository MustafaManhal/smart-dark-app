/**
 * Optional book details lookup. Only runs when the user asks; sends just the
 * search text. Open Library first (allows browser requests, covers included),
 * Google Books as a second source (keyless requests are often rate limited).
 */
export type BookMatch = { source: "Open Library" | "Google Books"; title: string; author: string; year: number | null; coverUrl: string | null };

type OpenLibraryDoc = { title?: string; author_name?: string[]; cover_i?: number; first_publish_year?: number };
type GoogleItem = { volumeInfo?: { title?: string; subtitle?: string; authors?: string[]; publishedDate?: string; imageLinks?: { thumbnail?: string } } };

export function parseOpenLibrary(json: { docs?: OpenLibraryDoc[] }): BookMatch[] {
  return (json.docs ?? []).filter((d) => d.title).map((d) => ({
    source: "Open Library",
    title: d.title!,
    author: (d.author_name ?? []).slice(0, 3).join(", "),
    year: d.first_publish_year ?? null,
    // default=false: a missing cover is a 404 instead of a blank placeholder image.
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg?default=false` : null,
  }));
}

export function parseGoogleBooks(json: { items?: GoogleItem[] }): BookMatch[] {
  return (json.items ?? []).filter((i) => i.volumeInfo?.title).map((i) => {
    const v = i.volumeInfo!;
    const year = Number.parseInt(v.publishedDate ?? "", 10);
    const thumb = v.imageLinks?.thumbnail?.replace(/^http:/, "https:").replace("&edge=curl", "") ?? null;
    return {
      source: "Google Books",
      title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title!,
      author: (v.authors ?? []).slice(0, 3).join(", "),
      year: Number.isFinite(year) ? year : null,
      coverUrl: thumb,
    };
  });
}

async function getJson(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function searchBooks(query: string, { timeoutMs = 8000 } = {}): Promise<BookMatch[]> {
  const q = encodeURIComponent(query.trim()).replace(/%20/g, "+");
  const sources = await Promise.allSettled([
    getJson(`https://openlibrary.org/search.json?q=${q}&limit=8&fields=key,title,author_name,cover_i,first_publish_year`, timeoutMs).then(parseOpenLibrary),
    getJson(`https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=6&printType=books`, timeoutMs).then(parseGoogleBooks),
  ]);
  if (sources.every((s) => s.status === "rejected")) throw new Error("Book details could not be reached. Check your connection.");
  return sources.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
}

/** Downloads a cover image as a Blob (null if the site does not allow it). */
export async function fetchCover(url: string): Promise<Blob | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.type.startsWith("image/") && blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}
