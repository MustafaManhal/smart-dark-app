import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { saveSetting, settings } from "../settings";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { lookUp, wiktionaryPage, type Definition } from "./dictionary";

/** The meanings of a selected word. Asks before the first word is sent anywhere. */
export function LookupSheet({ word, onClose }: { word: string | null; onClose: () => void }) {
  const allowed = settings.wordLookupOn.value;
  const [found, setFound] = useState<Definition[] | "loading" | "failed">("loading");
  useEffect(() => {
    if (!word || !allowed) return;
    let live = true;
    setFound("loading");
    lookUp(word).then((d) => live && setFound(d)).catch(() => live && setFound("failed"));
    return () => { live = false; };
  }, [word, allowed]);

  return (
    <Sheet open={!!word} title={t("Look up")} onClose={onClose}>
      {word && (
        <div class="lookup-word">
          <h3 dir="auto">{word}</h3>
          {!allowed ? (
            <>
              <p>{t("Look this word up in Wiktionary? The word is sent to en.wiktionary.org. Nothing else leaves this device.")}</p>
              <div class="sheet-actions">
                <Button onClick={onClose}>{t("Cancel")}</Button>
                <Button variant="primary" onClick={() => saveSetting("wordLookupOn", true)}>{t("Turn on word lookup")}</Button>
              </div>
            </>
          ) : found === "loading" ? <p role="status">{t("Looking it up…")}</p>
            : found === "failed" ? <p role="alert">{t("The dictionary could not be reached. Check your connection.")}</p>
            : found.length === 0 ? <p role="status">{t("No entry for this word.")}</p>
            : (
              <div class="lookup-entries">
                {found.map((entry) => (
                  <section>
                    <h4>{[entry.partOfSpeech, entry.language].filter(Boolean).join(" · ")}</h4>
                    <ol>{entry.meanings.map((m) => <li dir="auto">{m}</li>)}</ol>
                  </section>
                ))}
              </div>
            )}
          {allowed && (
            <p class="lookup-source">
              <a href={wiktionaryPage(word)} target="_blank" rel="noopener noreferrer">{t("Open in Wiktionary")}</a>
              <span>{t("Text from Wiktionary, CC BY-SA.")}</span>
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
