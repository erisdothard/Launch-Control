import Image from "next/image";
import type { Shot } from "@/content/site";
import { site } from "@/content/site";

/*
  Screenshot frames. Desktop: a thin window bar over the image. Phone: a drawn iPhone.
  Images are the clients' public pages or demo screens, captured at 2x pixel density (2560x1600
  for a 1280x800 viewport; phones at 3x, 1170x2532 for 390 wide or 1290x2796 for 430 wide) so they stay sharp on Retina displays, and served through next/image
  with explicit dimensions (no layout shift). `sizes` must match the rendered slot or the browser
  picks a candidate too small for the device pixel ratio and the text goes soft.
*/

const SHOT_QUALITY = 90;

export const FRAME_SIZES = {
  /* 7 of 12 columns inside the 1200px container */
  featured: "(min-width: 1024px) 640px, 100vw",
} as const;

export function BrowserFrame({
  shot,
  sizes = FRAME_SIZES.featured,
  priority = false,
  className = "",
}: {
  shot: Shot;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure className={`m-0 overflow-hidden border border-border bg-surface ${className}`}>
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2" aria-hidden="true">
        <span className="h-2 w-2 rounded-round bg-border" />
        <span className="h-2 w-2 rounded-round bg-border" />
        <span className="h-2 w-2 rounded-round bg-border" />
      </div>
      <Image
        src={shot.src}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        sizes={sizes}
        quality={SHOT_QUALITY}
        priority={priority}
        className="block h-auto w-full"
      />
    </figure>
  );
}

/*
  PhoneFrame draws an iPhone around the capture: titanium rim, continuous corner radius, the
  Dynamic Island in a status bar (clock left, signal / wifi / battery right) and the side buttons.
  The captures have no status bar of their own (Playwright's phone viewport starts at the page),
  so the drawn bar sits above the image on the same near-black every app in the row opens on.
  Every dimension is in container-query units (`.phone-frame` in globals.css), so the same
  component is right at 150px in a collage and at 380px in the screen viewer.
*/
function StatusGlyphs() {
  return (
    <svg aria-hidden="true" viewBox="0 0 70 12" fill="currentColor" className="phone-frame__glyphs">
      <rect x="0" y="7" width="3" height="5" rx="0.6" />
      <rect x="4.5" y="5" width="3" height="7" rx="0.6" />
      <rect x="9" y="3" width="3" height="9" rx="0.6" />
      <rect x="13.5" y="1" width="3" height="11" rx="0.6" />
      <path d="M22 4.2a10 10 0 0 1 13 0l-1.5 1.7a7.7 7.7 0 0 0-10 0Zm2.6 2.9a6.2 6.2 0 0 1 7.8 0l-1.5 1.7a3.9 3.9 0 0 0-4.8 0Zm2.6 2.9a2.5 2.5 0 0 1 2.6 0l-1.3 1.5Z" />
      <rect x="42" y="0.75" width="24" height="10.5" rx="2.75" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      <rect x="43.5" y="2.25" width="21" height="7.5" rx="1.5" />
      <path d="M67.5 4v4a2 2 0 0 0 0-4Z" fillOpacity="0.4" />
    </svg>
  );
}

export function PhoneFrame({ shot, sizes = "150px", className = "" }: { shot: Shot; sizes?: string; className?: string }) {
  return (
    <figure className={`phone-frame m-0 ${className}`}>
      <div className="phone-frame__body">
        <div className="phone-frame__screen">
          <div className="phone-frame__status" aria-hidden="true">
            <span className="phone-frame__clock">{site.work.phoneClock}</span>
            <span className="phone-frame__island" />
            <StatusGlyphs />
          </div>
          <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} sizes={sizes} quality={SHOT_QUALITY} className="block h-auto w-full" />
        </div>
      </div>
    </figure>
  );
}
