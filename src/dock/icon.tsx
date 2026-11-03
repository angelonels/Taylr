export function Icon({
  name,
}: {
  name:
    | "edit"
    | "fold"
    | "hide"
    | "undo"
    | "rules"
    | "close"
    | "up"
    | "down"
    | "grip"
    | "restore"
    | "site"
    | "moon";
}) {
  const paths = {
    edit: "m16 3 5 5-12 12-6 1 1-6L16 3ZM14 5l5 5",
    fold: "M4 7h16M4 12h10M4 17h16",
    site: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z",
    moon: "M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z",
    hide: "M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5M8 12h8",
    undo: "M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12",
    rules: "M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01",
    close: "m6 6 12 12M6 18 18 6",
    up: "m6 12 6-6 6 6M12 6v14",
    down: "m6 12 6 6 6-6M12 4v14",
    grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
    restore: "M4 5v6h6M4 11a8 8 0 1 1 2 7",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "grip" ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
