/**
 * Saves a file the way each platform supports:
 * - touch devices (iPhone home-screen apps ignore <a download>): the share
 *   sheet, which offers "Save to Files";
 * - everywhere else: a normal download.
 * Must be called from a tap/click (the share sheet needs a user gesture), so
 * build the file before the tap. Returns false if the user cancelled.
 */
export async function saveFile(file: File): Promise<boolean> {
  const touch = matchMedia("(hover: none)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") return false;
      // Fall through to a download for any other share failure.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.append(a); // iOS will not download from a detached anchor
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "export";
}
