import Image from "next/image";
import { site } from "@/content/site";

const { clients } = site;

/* The logo row under the hero: who we have shipped for. Marks where the client has one, the name
   in display type otherwise. Reads the same on every row entry so no client looks lesser. */
export function Clients() {
  return (
    <div className="relative border-t border-border bg-background/80" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto flex max-w-content-max flex-col gap-5 px-6 py-8 lg:flex-row lg:items-center lg:gap-12 lg:px-12">
        <p className="label-mono m-0 text-subtle">{clients.label}</p>
        <ul className="m-0 flex list-none flex-wrap items-center gap-x-10 gap-y-4 p-0">
          {clients.items.map((client) => {
            const inner = (
              <span className="flex items-center gap-3">
                {client.mark && (
                  <Image src={client.mark.src} alt="" width={client.mark.width} height={client.mark.height} className="h-7 w-auto" />
                )}
                <span className="font-display text-[13px] uppercase tracking-signage text-steel">{client.name}</span>
              </span>
            );
            return (
              <li key={client.name} className="opacity-80 transition-opacity duration-fast ease-ui hover:opacity-100">
                {client.href ? (
                  <a href={client.href} target="_blank" rel="noopener noreferrer" className="no-underline">
                    {inner}
                  </a>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
