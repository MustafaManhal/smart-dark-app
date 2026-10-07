import { signal } from "@preact/signals";
import { settings } from "../settings";
import { desktop, type UpdateResult } from "./desktop";

/**
 * Updates of the desktop app. The app asks GitHub for the newest release when it starts (once a day,
 * and only while "Check when the app starts" is on) and when the reader asks. "Update now" downloads
 * this computer's installer and opens it; the app then closes so the installer can replace it.
 */
export type UpdateState =
  | { step: "idle" } | { step: "checking" } | { step: "failed" }
  | { step: "result"; result: UpdateResult }
  | { step: "downloading"; latest: string; percent: number }
  | { step: "opened"; latest: string }
  | { step: "install-failed"; result: UpdateResult };

export const updateState = signal<UpdateState>({ step: "idle" });

export async function checkUpdates() {
  if (!desktop) return;
  updateState.value = { step: "checking" };
  try {
    updateState.value = { step: "result", result: await desktop.checkForUpdates() };
  } catch {
    updateState.value = { step: "failed" };
  }
}

export async function installUpdate() {
  const now = updateState.value;
  const result = now.step === "result" || now.step === "install-failed" ? now.result : null;
  if (!desktop || result?.status !== "available") return;
  updateState.value = { step: "downloading", latest: result.latest, percent: 0 };
  try {
    await desktop.installUpdate();
    updateState.value = { step: "opened", latest: result.latest };
  } catch (error) {
    console.error("The update could not be installed", error);
    updateState.value = { step: "install-failed", result };
  }
}

const DAY = 24 * 60 * 60 * 1000;

/** Called once when the desktop app starts. */
export function startUpdates() {
  if (!desktop) return;
  desktop.onUpdateProgress((percent) => {
    const now = updateState.value;
    if (now.step === "downloading") updateState.value = { ...now, percent };
  });
  if (!settings.updateAuto.value) return;
  let last = 0;
  try {
    last = Number(localStorage.getItem("updateCheckedAt")) || 0;
  } catch {}
  if (Date.now() - last < DAY) return;
  try {
    localStorage.setItem("updateCheckedAt", String(Date.now()));
  } catch {}
  // A quiet check: a failure (no connection) says nothing.
  desktop.checkForUpdates().then((result) => {
    if (result.status === "available") updateState.value = { step: "result", result };
  }).catch(() => {});
}
