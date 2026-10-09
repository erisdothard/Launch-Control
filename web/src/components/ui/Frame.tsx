import Image from "next/image";
import type { Shot } from "@/content/site";

/*
  Screenshot frames. Desktop: a thin window bar over the image. Phone: a rounded device edge.
  Images are the clients' public pages or demo screens, captured at 2x pixel density (3200x2000
  for a 1600x1000 viewport) so they stay sharp on Retina displays, and served through next/image
  with explicit dimensions (no layout shift). `sizes` must match the rendered slot or the browser
  picks a candidate too small for the device pixel ratio and the text goes soft.
*/

const SHOT_QUALITY = 90;

export const FRAME_SIZES = {
  /* 7 of 12 columns inside the 1200px container */
  featured: "(min-width: 1024px) 640px, 100vw",
  /* half the container */
  half: "(min-width: 1024px) 560px, (min-width: 640px) 50vw, 100vw",
  /* the full container */
  full: "(min-width: 1200px) 1104px, 100vw",
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

export function PhoneFrame({ shot, className = "" }: { shot: Shot; className?: string }) {
  return (
    <figure className={`m-0 overflow-hidden rounded-[22px] border-[6px] border-elevated bg-surface shadow-[0_0_0_1px_var(--color-border)] ${className}`}>
      <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} sizes="150px" quality={SHOT_QUALITY} className="block h-auto w-full" />
    </figure>
  );
}
