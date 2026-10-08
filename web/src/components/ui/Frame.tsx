import Image from "next/image";
import type { Shot } from "@/content/site";

/*
  Screenshot frames. Desktop: a thin window bar over the image. Phone: a rounded device edge.
  Images are the clients' public pages or demo dashboards, exported at 2x and served through
  next/image with explicit dimensions (no layout shift).
*/

export function BrowserFrame({ shot, priority = false, className = "" }: { shot: Shot; priority?: boolean; className?: string }) {
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
        sizes="(min-width: 1024px) 800px, 100vw"
        priority={priority}
        className="block h-auto w-full"
      />
    </figure>
  );
}

export function PhoneFrame({ shot, className = "" }: { shot: Shot; className?: string }) {
  return (
    <figure className={`m-0 overflow-hidden rounded-[22px] border-[6px] border-elevated bg-surface shadow-[0_0_0_1px_var(--color-border)] ${className}`}>
      <Image src={shot.src} alt={shot.alt} width={shot.width} height={shot.height} sizes="200px" className="block h-auto w-full" />
    </figure>
  );
}
