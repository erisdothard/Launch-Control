/*
  /demo/<client>: a proposed-system film cut for one prospect, the link Max sends them. Same frame as
  /demo, but unlisted: noindex, not in the nav or the sitemap. Unknown slugs 404.
*/

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { site } from "@/content/site";
import { BrandMark } from "@/components/ui/BrandMark";
import { LiveryStripe } from "@/components/ui/LiveryStripe";
import { FilmPlayer } from "@/components/ui/FilmPlayer";
import { DemoContact } from "./DemoContact";

type Params = Promise<{ client: string }>;

const filmFor = (slug: string) => site.clientFilms.find((f) => f.slug === slug);

export const dynamicParams = false;

export function generateStaticParams() {
  return site.clientFilms.map((f) => ({ client: f.slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const film = filmFor((await params).client);
  if (!film) return {};
  const path = `/demo/${film.slug}`;
  return {
    title: film.metaTitle,
    description: film.metaDescription,
    robots: { index: false, follow: false },
    alternates: { canonical: path },
    openGraph: { title: film.metaTitle, description: film.metaDescription, type: "video.other", url: path, siteName: site.brand.name, images: [film.poster] },
    twitter: { card: "summary_large_image", title: film.metaTitle, description: film.metaDescription, images: [film.poster] },
  };
}

export default async function ClientDemoPage({ params }: { params: Params }) {
  const film = filmFor((await params).client);
  if (!film) notFound();
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
      <div className="mx-auto w-full max-w-content-max px-6 py-8 lg:px-12 lg:py-10">
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <LiveryStripe className="mb-4" />
            <h1 className="text-title">{film.title}</h1>
          </div>
          <p className="max-w-[60ch] text-body text-muted lg:col-span-7 lg:self-end">{film.intro}</p>
        </div>
        <figure className="m-0 max-w-[calc((100svh-16rem)*16/9)] overflow-hidden border border-border bg-surface">
          <FilmPlayer poster={film.poster} sources={film.sources} label={film.label} />
        </figure>
        <DemoContact slug={film.slug} />
      </div>
    </main>
  );
}
