// Icon paths drawn for this project on a 24px grid.
const PATHS = {
  back: "M15 18l-6-6 6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  chevronRight: "M9 18l6-6-6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fitWidth: "M3 5v14M21 5v14M7 12h10M10 9l-3 3 3 3M14 9l3 3-3 3",
  fitPage: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM12 7v10M9.5 9.5 12 7l2.5 2.5M9.5 14.5 12 17l2.5-2.5",
  close: "M6 6l12 12M18 6L6 18",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  more: "M4.4 12a.6.6 0 1 0 1.2 0a.6.6 0 1 0-1.2 0M11.4 12a.6.6 0 1 0 1.2 0a.6.6 0 1 0-1.2 0M18.4 12a.6.6 0 1 0 1.2 0a.6.6 0 1 0-1.2 0",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  palette: "M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3zM7.5 12h.01M9.5 8h.01M14.5 8h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  sticky: "M5 4h14v10l-6 6H5zM13 20v-6h6",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  eraser: "M16.3 3.9l3.8 3.8a1.6 1.6 0 0 1 0 2.2L11 19H7.2l-3.3-3.3a1.6 1.6 0 0 1 0-2.2l10.2-9.6a1.6 1.6 0 0 1 2.2 0zM8.6 9.1l6.3 6.3M7 19h13",
  paste: "M9 4h6v3H9zM9 5H6v15h12V5h-3M9 12h6M9 16h4",
  highlighter: "M9 11l6-6 4 4-6 6M9 11l-3 3v4h4l3-3M4 21h7",
  note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  notes: "M4 5h16v11H10l-5 4v-4H4zM8 9h8M8 12h5",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  area: "M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3",
  rotateRight: "M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5",
  rotateLeft: "M4 12a8 8 0 1 0 2.6-5.9M4 4v5h5",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  rows: "M4 5h4v4H4zM11 7h9M4 15h4v4H4zM11 17h9",
  keyboard: "M3 7h18v10H3zM7 10.5h.01M11 10.5h.01M15 10.5h.01M8 14h8",
  autoScroll: "M12 4v14M7 13l5 5 5-5M5 21h14M9 4h6",
  print: "M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M7 14h10v6H7z",
  backup: "M4 7h16v3H4zM5 10v9h14v-9M10 14h4",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  check: "M5 12l4 4 10-10",
  share: "M12 3v12M8 7l4-4 4 4M6 11H5v10h14V11h-1",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v6H5a1 1 0 0 1-1-1zM20 15h-3v6h2a1 1 0 0 0 1-1z",
  play: "M8 5v14l11-7z",
  pause: "M6.5 5h3v14h-3zM14.5 5h3v14h-3z",
  skipBack: "M18 6v12L9 12zM6 6v12",
  skipForward: "M6 6v12l9-6zM18 6v12",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  moonTimer: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8zM15 3h4l-4 4h4",
  collapse: "M6 15l6-6 6 6",
  expand: "M6 9l6 6 6-6",
} as const;

export type IconName = keyof typeof PATHS;

// Icons that point "forward/back" mirror in right-to-left languages.
const FLIP = new Set<string>(["back", "chevronLeft", "chevronRight", "skipBack", "skipForward"]);

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg class={FLIP.has(name) ? "icon icon-flip" : "icon"} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
