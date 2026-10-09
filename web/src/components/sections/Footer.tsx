import { site } from "@/content/site";

const { footer, brand, nav } = site;

/* Footer: wordmark and blurb, site nav, contact, elsewhere, then the legal line and the
   mandatory CC BY credit for the engine model. */
export function Footer() {
  const year = new Date().getFullYear();
  const credit = `${footer.credit.modelName}, ${footer.credit.author}, ${footer.credit.license}`;
  const link = "no-underline transition-colors duration-fast ease-ui hover:text-ember";
  return (
    <footer className="relative border-t border-border bg-surface" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto grid max-w-content-max grid-cols-1 gap-10 px-6 py-10 sm:grid-cols-2 lg:grid-cols-12 lg:gap-8 lg:px-12 lg:py-12">
        <div className="flex flex-col gap-4 sm:col-span-2 lg:col-span-4">
          <p className="m-0 font-display text-[13px] uppercase tracking-signage text-steel">{brand.wordmark}</p>
          <p className="m-0 max-w-[36ch] text-body text-muted">{footer.blurb}</p>
        </div>
        <nav aria-label={footer.navLabel} className="flex flex-col gap-3 lg:col-span-2">
          <p className="label-mono m-0 text-subtle">{footer.navLabel}</p>
          {nav.map((item) => (
            <a key={item.href} href={item.href} className={`text-body text-text ${link}`}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex flex-col gap-3 lg:col-span-4">
          <p className="label-mono m-0 text-subtle">{footer.contactLabel}</p>
          <a href={`mailto:${footer.email}`} className={`text-body text-text ${link}`}>
            {footer.email}
          </a>
          <p className="m-0 text-body text-muted">{footer.location}</p>
        </div>
        <div className="flex flex-col gap-3 lg:col-span-2">
          <p className="label-mono m-0 text-subtle">{footer.socialLabel}</p>
          {footer.social.map((item) => (
            <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={`text-body text-text ${link}`}>
              {item.label}
            </a>
          ))}
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-content-max flex-col gap-2 px-6 py-5 font-mono text-caption text-subtle lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <p className="m-0 tabular-nums">
            © {year} {footer.legal}
          </p>
          <p className="m-0">
            {footer.credit.prefix}{" "}
            <a href={footer.credit.href} target="_blank" rel="noopener noreferrer license" className={`underline decoration-1 underline-offset-4 ${link}`}>
              {credit}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
