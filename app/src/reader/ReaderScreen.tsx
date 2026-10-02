import type { Repos } from "../db/repos";

// Replaced in Task 7.
export function ReaderScreen(_: { repos: Repos; bookId: string }) {
  return <main class="reader" />;
}
