import { notFound } from "next/navigation";
import AdminHeader from "@/components/admin/AdminHeader";
import { createServerSupabaseClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isOwner } from "@/lib/auth/owner";

// Private bucket; the page hands out a short-lived signed URL only after the owner check.
const BUCKET = "ops-private";
const VIDEO = "agent-story-v1.mp4";
const POSTER = "agent-story-v1.jpg";
const SIGNED_SECONDS = 60 * 60;

const BEATS = [
  { tag: "01", name: "The Prospector", seat: "Bay 01 · Timing & Scoring", does: "Finds and scores leads. Ridge Motorsport Park comes in at 82." },
  { tag: "02", name: "The Outreach Writer", seat: "Bay 02 · Commercial Desk", does: "Drafts the email from evidence on their site. Holds it for approval." },
  { tag: "RC", name: "Guardian", seat: "Race Control", does: "Checks bounce rate, send caps and opt-out. Nothing leaves without your OK." },
  { tag: "→", name: "Sent", seat: "Pit lane", does: "The approved email goes out through the inbox Max already uses." },
  { tag: "03", name: "The Strategist", seat: "Bay 03 · Strategy Wall", does: "Reads replies and outcomes, and says which segments to push." },
];

async function signedUrl(path: string): Promise<string | null> {
  const db = createServiceRoleClient();
  if (!db) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  if (error) return null;
  return data.signedUrl;
}

export default async function OpsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isOwner(user?.email)) notFound();

  const [video, poster] = await Promise.all([signedUrl(VIDEO), signedUrl(POSTER)]);

  return (
    <>
      <AdminHeader
        title="Agent Ops"
        subtitle="One lead through the whole agent pit: found, written, cleared, sent, answered, learned from. Only you can see this page."
      />

      <section className="card max-w-[1200px] overflow-hidden p-0">
        {video ? (
          <video
            src={video}
            poster={poster ?? undefined}
            controls
            playsInline
            loop
            preload="metadata"
            className="block aspect-video w-full bg-black"
          />
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-black px-8 text-center">
            <p className="font-display text-lg tracking-[0.04em] text-[var(--color-steel)]">Rendering</p>
            <p className="text-base text-[var(--color-text-muted)]">The video shows up here as soon as it&apos;s uploaded.</p>
          </div>
        )}
      </section>

      <ol className="mt-8 grid max-w-[1200px] gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {BEATS.map((b) => (
          <li key={b.name} className="card px-5 py-4">
            <p className="font-display text-[13px] tracking-[var(--tracking-signage)] text-[var(--color-accent)]">{b.tag}</p>
            <p className="mt-1 text-[16px] font-semibold text-[var(--color-text)]">{b.name}</p>
            <p className="text-[13px] text-[var(--color-text-dim)]">{b.seat}</p>
            <p className="mt-2 text-[14px] text-[var(--color-text-muted)]">{b.does}</p>
          </li>
        ))}
      </ol>
    </>
  );
}
