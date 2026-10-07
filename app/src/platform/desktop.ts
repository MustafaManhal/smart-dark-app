import type { Repos } from "../db/repos";
import { openIncoming } from "./incoming";

type OpenedFile = { name: string; bytes: Uint8Array };
export type UpdateResult =
  | { status: "off"; current: string }
  | { status: "current"; current: string; latest: string }
  | { status: "available"; current: string; latest: string; url: string };

type DesktopBridge = {
  platform: string;
  ready(): Promise<OpenedFile[]>;
  onOpenFile(cb: (f: OpenedFile) => void): void;
  onNavigate(cb: (hash: string) => void): void;
  openDialog(): Promise<void>;
  checkForUpdates(): Promise<UpdateResult>;
  openExternal(url: string): Promise<void>;
};

/** Present only inside the desktop app (exposed by desktop/preload.cjs). */
export const desktop = (globalThis as { desktop?: DesktopBridge }).desktop;

/** Wires OS file opening and menu navigation to the app. */
export async function initDesktop(repos: Repos) {
  if (!desktop) return;
  // Lets CSS make room for the macOS window buttons (see app.css).
  document.documentElement.dataset.platform = desktop.platform;
  desktop.onNavigate((hash) => {
    location.hash = hash;
  });
  const open = (file: OpenedFile) =>
    openIncoming(repos, [new File([file.bytes as Uint8Array<ArrayBuffer>], file.name, { type: "application/pdf" })]);
  desktop.onOpenFile(open);
  for (const file of await desktop.ready()) await open(file);
}
