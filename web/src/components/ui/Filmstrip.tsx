import type { Shot } from "@/content/site";
import { BrowserFrame, PhoneFrame } from "@/components/ui/Frame";

export interface Screen {
  label: string;
  desk: Shot;
  phone: Shot;
}

/*
  A row of product screens that scrolls sideways and snaps, one frame tall however many screens
  there are. Each screen was captured twice: on a wide viewport the browser-framed 1280px desktop
  shot shows, big enough that its type stays readable; on a phone the real phone capture shows in a
  phone frame instead of a desktop page shrunk four times. The hidden variant is lazy, so the
  browser never fetches it.
*/

const SLIDE = "w-[64%] shrink-0 snap-start sm:w-[78%] lg:w-[82%]";
const DESK_SIZES = "(min-width: 1200px) 905px, (min-width: 640px) 78vw, 100vw";
const PHONE_SIZES = "64vw";

export function Filmstrip({ screens, labelledBy }: { screens: readonly Screen[]; labelledBy: string }) {
  return (
    <ul
      aria-labelledby={labelledBy}
      className="filmstrip -mx-6 m-0 flex snap-x snap-mandatory list-none gap-4 overflow-x-auto scroll-px-6 px-6 pb-3 sm:mx-0 sm:scroll-px-0 sm:px-0 lg:gap-6"
    >
      {screens.map((screen) => (
        <li key={screen.label} className={SLIDE}>
          <BrowserFrame shot={screen.desk} sizes={DESK_SIZES} className="hidden sm:block" />
          <PhoneFrame shot={screen.phone} sizes={PHONE_SIZES} className="sm:hidden" />
          <p className="label-mono mt-3 text-subtle">{screen.label}</p>
        </li>
      ))}
    </ul>
  );
}
