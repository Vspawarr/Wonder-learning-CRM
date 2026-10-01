// Line icons from the prototype (24×24, stroke-based).
const PATHS = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20c0-3.5 3.5-5.5 7-5.5s7 2 7 5.5" />
      <path d="M16 4.5a3.5 3.5 0 010 7M18 14.5c2.5.5 4 2.5 4 5.5" />
    </>
  ),
  funnel: <path d="M3 4h18l-7 8v7l-4 2v-9z" />,
  rupee: <path d="M6 4h12M6 9h12M9 4c6 0 6 10 0 10H6l8 7" />,
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18" />
    </>
  ),
  school: (
    <>
      <path d="M3 10l9-6 9 6" />
      <path d="M5 10v10h14V10M10 20v-6h4v6" />
    </>
  ),
  check: <path d="M4 12l5 5L20 6" />,
  box: (
    <>
      <path d="M3 7l9-4 9 4v10l-9 4-9-4z" />
      <path d="M3 7l9 4 9-4M12 11v10" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4-4" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  doc: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  upload: <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />,
  phone: <path d="M5 4h4l2 5-2 1a11 11 0 005 5l1-2 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
  logout: <path d="M15 4h4v16h-4M10 16l4-4-4-4M14 12H4" />,
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l9-9M17 6l3 3" />
    </>
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      className={`inline-block flex-none align-[-3px] ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <path d="M4 26a13 13 0 0126 0" stroke="#F4A62A" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M9 26a8 8 0 0116 0" stroke="#2E9BDA" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M14 26a3 3 0 016 0" stroke="#E5533F" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
