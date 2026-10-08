import { site } from "@/content/site";

const { footer, brand } = site;

/* Mono utility block. Carries the mandatory CC BY credit as a link. */
export function Footer() {
  const year = new Date().getFullYear();
  const credit = `${footer.credit.modelName}, ${footer.credit.author}, ${footer.credit.license}`;
  return (
    <footer className="relative border-t border-border bg-surface font-mono text-caption font-medium text-subtle" style={{ zIndex: "var(--z-content)" }}>
      <div className="mx-auto flex max-w-content-max flex-col gap-6 px-6 py-12 lg:flex-row lg:items-start lg:justify-between lg:gap-8 lg:px-12">
        <p className="label-mono text-muted">{brand.wordmark}</p>
        <div className="flex max-w-[60ch] flex-col gap-2">
          <p>
            {footer.credit.prefix}{" "}
            <a
              href={footer.credit.href}
              target="_blank"
              rel="noopener noreferrer license"
              className="underline decoration-1 underline-offset-4 transition-colors duration-fast ease-ui hover:text-ember"
            >
              {credit}
            </a>
          </p>
        </div>
        <p className="flex flex-col gap-2 lg:items-end">
          <a
            href={`mailto:${footer.email}`}
            className="underline decoration-1 underline-offset-4 transition-colors duration-fast ease-ui hover:text-ember"
          >
            {footer.email}
          </a>
          <span className="tabular-nums">
            {footer.legal} {year}
          </span>
        </p>
      </div>
    </footer>
  );
}
