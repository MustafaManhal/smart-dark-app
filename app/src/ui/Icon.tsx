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
  more: "M5 12h.01M12 12h.01M19 12h.01",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  palette: "M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.5 17 3 12 3zM7.5 12h.01M9.5 8h.01M14.5 8h.01",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  sticky: "M5 4h14v10l-6 6H5zM13 20v-6h6",
  highlighter: "M9 11l6-6 4 4-6 6M9 11l-3 3v4h4l3-3M4 21h7",
  note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  notes: "M4 5h16v11H10l-5 4v-4H4zM8 9h8M8 12h5",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload: "M12 20V9M7 14l5-5 5 5M5 4h14",
  check: "M5 12l4 4 10-10",
  collapse: "M6 15l6-6 6 6",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}
