import type { Repos } from "../db/repos";

// Replaced in Task 6.
export function LibraryScreen(_: { repos: Repos }) {
  return <main class="library"><h1>Your library</h1></main>;
}
