import { THEMES, TINTS } from "../../../src/viewer/smart-invert.js";
import type { DarkTheme, PageStyle } from "../settings";

const rgb = (c: number[]) => `rgb(${c.join(" ")})`;

/** The real paper and ink of a dark theme, as the color engine draws them. */
export const themeColors = (theme: DarkTheme) => ({ paper: rgb(THEMES[theme].bg), ink: rgb(THEMES[theme].fg) });

/** The real paper and ink of a page style. Smart dark shows the dark theme that is chosen. */
export function pageColors(style: PageStyle, theme: DarkTheme) {
  if (style === "original") return { paper: "#ffffff", ink: "#1b1a17" };
  if (style === "sepia") return { paper: rgb(TINTS.sepia.paper), ink: rgb(TINTS.sepia.ink) };
  return themeColors(theme);
}

/** A tiny page in the colors an option gives, shown inside the option. */
export function Swatch({ paper, ink }: { paper: string; ink: string }) {
  return <i class="page-swatch" aria-hidden="true" style={{ background: paper, color: ink }}>A</i>;
}
