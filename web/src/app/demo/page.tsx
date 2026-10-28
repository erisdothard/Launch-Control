/*
  /demo: the CRM film on its own page, the link that goes out in emails and messages. No engine, no
  nav: the film first, one call to action back to the booking form. The link preview image is
  opengraph-image.jpg beside this file (the film's closing card).
*/

import type { Metadata } from "next";
import Link from "next/link";
import { site } from "@/content/site";
import { BrandMark } from "@/components/ui/BrandMark";
import { ButtonLink } from "@/components/ui/Button";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { FilmPlayer } from "@/components/ui/FilmPlayer";

const { film } = site;
const { share } = film;

export const metadata: Metadata = {
  title: share.metaTitle,
  description: share.metaDescription,
  alternates: { canonical: share.path },
  openGraph: { title: share.metaTitle, description: share.metaDescription, type: "video.other", url: share.path, siteName: site.brand.name },
  twitter: { card: "summary_large_image", title: share.metaTitle, description: share.metaDescription },
};

export default function DemoPage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-content-max items-center px-6 py-4 lg:px-12">
          <Link href="/" className="flex items-center gap-2.5 font-display text-[11px] uppercase tracking-signage text-steel no-underline sm:text-[13px]">
            <BrandMark className="h-6 w-auto" />
            {site.brand.wordmark}
          </Link>
        </div>
      </header>
      {/* Heading kept to a title size so the whole film sits in the first screen on a laptop. */}
      <div className="mx-auto w-full max-w-content-max px-6 py-8 lg:px-12 lg:py-10">
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-4" />
            <h1 className="text-title">{film.title}</h1>
          </div>
          <p className="max-w-[60ch] text-body text-muted lg:col-span-7 lg:self-end">{film.intro}</p>
        </div>
        {/* Width capped by screen height (16:9) so short laptop screens still show the whole film. */}
        <figure className="m-0 max-w-[calc((100svh-16rem)*16/9)] overflow-hidden border border-border bg-surface">
          <FilmPlayer poster={film.poster} sources={film.sources} label={film.label} />
        </figure>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <ButtonLink href={share.cta.href} variant="primary">
            {share.cta.label}
          </ButtonLink>
          <Link href="/" className="label-mono py-3 text-steel sm:px-4 no-underline hover:text-text">
            {share.home}
          </Link>
          <p className="label-mono m-0 text-subtle sm:ml-auto">{film.note}</p>
        </div>
      </div>
    </main>
  );
}
