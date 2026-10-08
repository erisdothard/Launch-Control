import { site } from "@/content/site";
import { Nav } from "@/components/nav/Nav";
import { ButtonLink } from "@/components/ui/Button";
import { LiveryStripe } from "@/components/ui/LiveryStripe";

export default function NotFound() {
  const { notFound } = site;
  return (
    <>
      <Nav />
      <main className="flex flex-1 items-center">
        <div className="mx-auto w-full max-w-content-max px-6 py-32 lg:px-12">
          <LiveryStripe className="mb-8" />
          <p className="label-mono mb-6 text-subtle">404</p>
          <h1 className="max-w-[17ch] text-hero">{notFound.title}</h1>
          <p className="mt-6 max-w-[52ch] text-lead text-muted">{notFound.body}</p>
          <div className="mt-10">
            <ButtonLink href={notFound.cta.href}>{notFound.cta.label}</ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}
