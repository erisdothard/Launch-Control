// Line icons for the Inbox, drawn on the same 20px grid and 1.6 stroke as the sidebar's.
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const InboxIcon = () => (
  <svg {...base}>
    <path d="M3 11.5V15a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15v-3.5" />
    <path d="M3 11.5 5.2 4.6A1.5 1.5 0 0 1 6.6 3.5h6.8a1.5 1.5 0 0 1 1.4 1.1l2.2 6.9H13l-1 2h-4l-1-2z" />
  </svg>
);
export const ReplyNeededIcon = () => (
  <svg {...base}>
    <path d="M3.5 15.5V5a1.5 1.5 0 0 1 1.5-1.5h10A1.5 1.5 0 0 1 16.5 5v7a1.5 1.5 0 0 1-1.5 1.5H7z" />
    <path d="M10 6.5v3M10 11.8v.2" />
  </svg>
);
export const DraftIcon = () => (
  <svg {...base}>
    <path d="M12.5 3.5l4 4L8 16H4v-4z" />
    <path d="M10.5 5.5l4 4" />
  </svg>
);
export const SentIcon = () => (
  <svg {...base}>
    <path d="M17 3 3 9l6 2 2 6z" />
    <path d="M9 11l8-8" />
  </svg>
);
export const ArchiveIcon = () => (
  <svg {...base}>
    <rect x="2.5" y="3.5" width="15" height="4" rx="1" />
    <path d="M4 7.5V15a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 15V7.5M8 11h4" />
  </svg>
);
export const PaperclipIcon = ({ size = 16 }: { size?: number }) => (
  <svg {...base} width={size} height={size}>
    <path d="M15.5 9.5l-5.8 5.8a3.5 3.5 0 0 1-5-5l6.4-6.4a2.3 2.3 0 0 1 3.3 3.3l-6.3 6.3a1.2 1.2 0 0 1-1.7-1.7l5.6-5.6" />
  </svg>
);
export const BackIcon = () => (
  <svg {...base}>
    <path d="M12 4l-6 6 6 6" />
  </svg>
);
export const SearchIcon = () => (
  <svg {...base} width={18} height={18}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13 13l4 4" />
  </svg>
);
export const PenIcon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M12.5 3.5l4 4L8 16H4v-4z" />
  </svg>
);
export const DownloadIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M10 3v10M6 9l4 4 4-4M4 17h12" />
  </svg>
);
export const CloseIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);
