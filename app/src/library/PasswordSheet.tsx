import { useEffect, useState } from "preact/hooks";
import { t } from "../i18n/i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";

/** Asks for the password of a protected PDF. `answer(null)` means the reader gave up. */
export function PasswordSheet({ locked }: { locked: { name: string; wrong: boolean; answer: (password: string | null) => void } | null }) {
  const [value, setValue] = useState("");
  useEffect(() => setValue(""), [locked]);
  return (
    <Sheet open={!!locked} title={t("Password needed")} onClose={() => locked?.answer(null)}>
      {locked && (
        <form class="password-form" onSubmit={(e) => { e.preventDefault(); if (value) locked.answer(value); }}>
          <p>{t("“{name}” is protected. Enter its password to open it.", { name: locked.name })}</p>
          {locked.wrong && <p class="form-error" role="alert">{t("That password is not right. Try again.")}</p>}
          <input type="password" autoFocus autocomplete="off" aria-label={t("Password")} placeholder={t("Password")}
            value={value} onInput={(e) => setValue(e.currentTarget.value)} />
          <p class="form-note">{t("The password is kept on this device so the book opens next time. It is not put in backups.")}</p>
          <div class="sheet-actions">
            <Button onClick={() => locked.answer(null)}>{t("Cancel")}</Button>
            <Button variant="primary" type="submit" disabled={!value}>{t("Open")}</Button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
