import type { Shot } from "@/content/site";
import { BrowserFrame, PhoneFrame } from "@/components/ui/Frame";

export interface Screen {
  label: string;
  desk?: Shot;
  phone: Shot;
}

/*
  A row of product screens that scrolls sideways and snaps, one frame tall however many screens
  there are. Each screen was captured twice: on a wide viewport the browser-framed 1280px desktop
  shot shows, big enough that its type stays readable; on a phone the real phone capture shows in a
  phone frame instead of a desktop page shrunk four times. The hidden variant is lazy, so the
  browser never fetches it. On desktop the row bleeds to the right edge of the viewport, so the
  next screen peeks past the column instead of being clipped by it; the gap equals the phone
  gutter, so a snapped slide never shows a sliver of the one before it.
*/

/* Phone: 78% of the content width, so the real phone capture renders near 70% scale. Desktop: the
   whole container width (a 1280 capture at ~86%), the next screen peeking in the right-hand bleed. */
const SLIDE = "w-[78%] shrink-0 snap-start sm:w-[86%] lg:w-full";
/* A phone-first app shows as phones everywhere: three across on desktop, two on a tablet. */
const PHONE_SLIDE = "w-[78%] shrink-0 snap-start sm:w-[46%] lg:w-[31%]";
const PHONE_ROW_SIZES = "(min-width: 1200px) 342px, (min-width: 640px) 46vw, 78vw";
const DESK_SIZES = "(min-width: 1200px) 1104px, (min-width: 640px) 86vw, 100vw";
const PHONE_SIZES = "78vw";

/* From lg up the row runs to the right edge of the viewport. Every row ends at the content
   container's inner right edge, which sits max(48px, 50vw - 552px) from the viewport edge
   (1200px container, 48px side padding), so that is the bleed, whatever cell the row is in. */
const BLEED = "lg:mr-[calc(-1*max(48px,50vw-552px))] lg:pr-[max(48px,50vw-552px)]";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function Filmstrip({ screens, labelledBy }: { screens: readonly Screen[]; labelledBy: string }) {
  const phonesOnly = screens.every((screen) => !screen.desk);
  return (
    <ul
      aria-labelledby={labelledBy}
      className={`filmstrip -mx-6 m-0 flex snap-x snap-mandatory list-none gap-6 overflow-x-auto scroll-px-6 px-6 pb-3 lg:ml-0 lg:scroll-pl-0 lg:pl-0 ${BLEED}`}
    >
      {screens.map((screen, index) => (
        <li key={screen.label} className={phonesOnly ? PHONE_SLIDE : SLIDE}>
          {screen.desk && <BrowserFrame shot={screen.desk} sizes={DESK_SIZES} className="hidden sm:block" />}
          <PhoneFrame shot={screen.phone} sizes={phonesOnly ? PHONE_ROW_SIZES : PHONE_SIZES} className={screen.desk ? "sm:hidden" : ""} />
          <p className="label-mono mt-3 whitespace-nowrap text-subtle">
            <span className="text-ember">{pad(index + 1)}</span>
            <span className="mx-2">/</span>
            {pad(screens.length)}
            <span className="mx-3 text-border">·</span>
            <span className="text-muted">{screen.label}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
