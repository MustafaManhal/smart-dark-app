/**
 * Looks a word up in Wiktionary (the free dictionary of the Wikimedia
 * Foundation). This sends the word, and nothing else, to en.wiktionary.org, so
 * it is off until the reader turns it on.
 */
export type Definition = { language: string; partOfSpeech: string; meanings: string[] };

type Raw = Record<string, { partOfSpeech?: string; language?: string; definitions?: { definition?: string }[] }[]>;

const ARABIC = /[؀-ۿ]/;

/** The words of a piece of HTML, without its tags. Nothing of it is ever put into the page as HTML. */
function plain(html: string) {
  return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The dictionary's answer, tidied: the word's own language first, at most four meanings for each kind of word. */
export function definitionsFrom(raw: Raw, word: string, strip: (html: string) => string = plain): Definition[] {
  const wanted = ARABIC.test(word) ? "ar" : "en";
  const languages = Object.keys(raw).sort((a, b) => Number(b === wanted) - Number(a === wanted));
  const out: Definition[] = [];
  for (const code of languages.slice(0, 2)) {
    for (const entry of raw[code] ?? []) {
      const meanings = (entry.definitions ?? []).map((d) => strip(d.definition ?? "")).filter(Boolean).slice(0, 4);
      if (meanings.length) out.push({ language: entry.language ?? code, partOfSpeech: entry.partOfSpeech ?? "", meanings });
    }
  }
  return out.slice(0, 6);
}

/** What was selected, as a word to look up: trimmed, without the punctuation around it. Null when it is not one to three words. */
export function wordToLookUp(selected: string): string | null {
  const word = selected.replace(/\s+/g, " ").trim().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
  return word && word.length <= 60 && word.split(" ").length <= 3 ? word : null;
}

export const wiktionaryPage = (word: string) => `https://en.wiktionary.org/wiki/${encodeURIComponent(word.replace(/ /g, "_"))}`;

export async function lookUp(word: string): Promise<Definition[]> {
  const ask = async (w: string) => {
    const response = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(w.replace(/ /g, "_"))}`, { headers: { Accept: "application/json" } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("The dictionary could not be reached.");
    return (await response.json()) as Raw;
  };
  // A word at the start of a sentence has a capital the dictionary may not know.
  const raw = (await ask(word)) ?? (word !== word.toLocaleLowerCase() ? await ask(word.toLocaleLowerCase()) : null);
  return raw ? definitionsFrom(raw, word) : [];
}
