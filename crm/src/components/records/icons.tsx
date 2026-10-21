// Line icons for record fields (lead record, pipeline cards, customers). 16px, 1.5 stroke,
// currentColor, so they take the label colour they sit next to.

type IconProps = { className?: string };

function Svg({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export const MailIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
    <path d="M2.5 4.5 8 8.5l5.5-4" />
  </Svg>
);

export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 2.5h2.5l1.2 3-1.5 1a7 7 0 0 0 4.3 4.3l1-1.5 3 1.2V13a1 1 0 0 1-1 1A11 11 0 0 1 2 3.5a1 1 0 0 1 1-1Z" />
  </Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12M8 2c1.8 1.8 2.6 3.8 2.6 6S9.8 12.2 8 14C6.2 12.2 5.4 10.2 5.4 8S6.2 3.8 8 2Z" />
  </Svg>
);

export const SourceIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 14V6M8 6 5 9M8 6l3 3" />
    <path d="M3 2.5h10" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
    <path d="M2.5 7h11M5.5 2v3M10.5 2v3" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4.5V8l2.5 1.5" />
  </Svg>
);

export const ReplyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 4 2.5 8l4 4" />
    <path d="M2.5 8h7a4 4 0 0 1 4 4v1" />
  </Svg>
);

export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 14V2.5M3.5 3h8l-1.5 3 1.5 3h-8" />
  </Svg>
);

export const PinIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14Z" />
    <circle cx="8" cy="6.5" r="1.5" />
  </Svg>
);

export const PersonIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="5.5" r="2.5" />
    <path d="M3 14c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" />
  </Svg>
);

export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="2" width="10" height="12" rx="1.5" />
    <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" />
  </Svg>
);

export const ArrowIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h8M9 5l3 3-3 3" />
  </Svg>
);

export const BackIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 8H4M7 5 4 8l3 3" />
  </Svg>
);

export const BoardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="3.5" height="11" rx="1" />
    <rect x="6.25" y="2.5" width="3.5" height="7" rx="1" />
    <rect x="10.5" y="2.5" width="3.5" height="9" rx="1" />
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
  </Svg>
);

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 4h10M6.5 4V2.5h3V4M6 7v4M10 7v4M4 4l.5 9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1l.5-9" />
  </Svg>
);

export const SparkIcon = ({ className = "" }: IconProps) => (
  <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" className={`shrink-0 ${className}`}>
    <path d="M6 0l1.4 4.6L12 6l-4.6 1.4L6 12 4.6 7.4 0 6l4.6-1.4z" />
  </svg>
);
