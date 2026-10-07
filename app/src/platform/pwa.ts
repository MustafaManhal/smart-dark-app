import { signal } from "@preact/signals";
import { desktop } from "./desktop";

/** Offline support: registers the service worker on the web (not in the desktop app). */
export async function registerServiceWorker() {
  if (desktop || !("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch (error) {
    console.warn("Offline support is not available", error);
  }
}

/** True inside the iPhone or Android app from a store (the shell puts `Capacitor` on the window). */
const inNativeShell = () => (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;

/** True when running as an installed app (home screen, dock, desktop app, or an app from a store). */
export function isInstalled() {
  return !!desktop || inNativeShell() || matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad Safari, where installing means Share → Add to Home Screen. */
export function isIosBrowser() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && !isInstalled();
}

export const storageInfo = signal<{ used: number; quota: number; persisted: boolean } | null>(null);

export async function refreshStorageInfo() {
  const est = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = (await navigator.storage?.persisted?.().catch(() => false)) ?? false;
  if (est) storageInfo.value = { used: est.usage ?? 0, quota: est.quota ?? 0, persisted };
}
