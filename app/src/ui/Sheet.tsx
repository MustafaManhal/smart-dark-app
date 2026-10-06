import type { ComponentChildren } from "preact";
import { t } from "../i18n/i18n";
import { useEffect } from "preact/hooks";
import { IconButton } from "./Button";

// Bottom sheet on phones, centered panel on wide screens (see .sheet in app.css).
// `peek` keeps what is behind the sheet visible and undimmed, for settings judged by eye.
export function Sheet({ open, title, onClose, peek, children }: {
  open: boolean; title: string; onClose: () => void; peek?: boolean; children: ComponentChildren;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div class={`sheet-backdrop ${peek ? "peek" : ""}`} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header class="sheet-head">
          <h2>{title}</h2>
          <IconButton label={t("Close")} icon="close" onClick={onClose} />
        </header>
        <div class="sheet-body">{children}</div>
      </section>
    </div>
  );
}
