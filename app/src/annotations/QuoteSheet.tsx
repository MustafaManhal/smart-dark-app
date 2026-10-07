import { useEffect, useRef, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { copyText } from "../platform/clipboard";
import { safeFileName, saveFile } from "../platform/saveFile";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { Sheet } from "../ui/Sheet";
import { drawQuote, QUOTE_THEMES, quoteText, type QuoteSource, type QuoteTheme } from "./quote";

const THEME_LABEL: Record<QuoteTheme, string> = { paper: "Paper", night: "Night", ink: "Ink" };

/** A marked passage as a picture to share, or as text with the book and page it comes from. */
export function QuoteSheet({ quote, onClose }: { quote: { text: string; source: QuoteSource } | null; onClose: () => void }) {
  const [theme, setTheme] = useState<QuoteTheme>("paper");
  const [status, setStatus] = useState("");
  const view = useRef<HTMLDivElement>(null);
  // The picture file is made as soon as it is drawn: saving has to happen inside the tap (see saveFile).
  const file = useRef<File | null>(null);

  useEffect(() => {
    setStatus("");
    file.current = null;
    if (!quote || !view.current) return;
    const canvas = drawQuote(quote.text, quote.source, theme);
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", quoteText(quote.text, quote.source));
    view.current.replaceChildren(canvas);
    canvas.toBlob((blob) => {
      if (blob) file.current = new File([blob], `${safeFileName(`${quote.source.title} p${quote.source.page}`)}.png`, { type: "image/png" });
    }, "image/png");
  }, [quote, theme]);

  return (
    <Sheet open={!!quote} title={t("Share a quote")} onClose={onClose}>
      {quote && (
        <div class="quote-sheet">
          <div class="quote-view" ref={view} />
          <fieldset class="seg">
            <legend>{t("Look")}</legend>
            {QUOTE_THEMES.map((name) => (
              <label><input type="radio" name="quoteTheme" checked={theme === name} onChange={() => setTheme(name)} />{t(THEME_LABEL[name])}</label>
            ))}
          </fieldset>
          <div class="sheet-actions">
            <Button onClick={async () => setStatus(t((await copyText(quoteText(quote.text, quote.source))) ? "Copied" : "Could not copy"))}>
              <Icon name="copy" size={18} /> {t("Copy as text")}
            </Button>
            <Button variant="primary" onClick={async () => { if (file.current && await saveFile(file.current)) setStatus(t("Picture saved")); }}>
              <Icon name="download" size={18} /> {t("Save picture")}
            </Button>
          </div>
          <p class="quote-status" role="status">{status}</p>
        </div>
      )}
    </Sheet>
  );
}

/** For the translation test: these reach t() through variables. */
export const QUOTE_STRINGS = Object.values(THEME_LABEL);
