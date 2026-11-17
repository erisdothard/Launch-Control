import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/brand/BrandMark";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isTrustedRedirect } from "@/lib/mcp/trustedApps";

// Where Supabase's OAuth server sends someone connecting an AI (ChatGPT) to the CRM. They sign in
// with their CRM login, see what the AI will be able to do, and allow or cancel.

export const dynamic = "force-dynamic";

interface ConsentPageProps {
  searchParams: Promise<{ authorization_id?: string; error?: string }>;
}

const CAN = ["See your Today list, leads, emails, drafts and campaigns", "Write drafts, notes and follow-up dates"];
const CANNOT = ["Send email. Drafts wait in the CRM until you press Send.", "Change settings, campaigns or sending addresses"];

export default async function ConsentPage({ searchParams }: ConsentPageProps) {
  const { authorization_id: authorizationId, error: failed } = await searchParams;
  if (!authorizationId || !/^[\w-]{1,128}$/.test(authorizationId)) return <Shell title="This link is incomplete">Start connecting again from ChatGPT.</Shell>;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const { data: allowed } = await supabase.rpc("is_crm_user");
  if (allowed !== true) redirect("/login?denied=1");

  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Shell title="This link has expired">Start connecting again from ChatGPT.</Shell>;
  // Already allowed before: straight back to the AI.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  if (!isTrustedRedirect(data.redirect_uri)) {
    return <Shell title="This app can't connect">Only ChatGPT and Claude can connect to the CRM. If you didn&rsquo;t start this, close this page.</Shell>;
  }
  const app = data.client.name?.trim() || "An AI app";
  return (
    <Shell title={`Connect ${app} to your CRM`}>
      <p>
        Signed in as {user.email}. Returns you to {new URL(data.redirect_uri).hostname}.
      </p>
      <h2 className="mt-6 text-[15px] font-semibold text-[var(--color-text)]">It will be able to</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {CAN.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <h2 className="mt-5 text-[15px] font-semibold text-[var(--color-text)]">It can&rsquo;t</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {CANNOT.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="mt-5 text-[var(--color-hot)]">
          That didn&rsquo;t go through. Try again.
        </p>
      )}
      <form method="post" action="/oauth/consent/decision" className="mt-8 flex gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button type="submit" name="decision" value="approve" className="btn btn-primary">
          Allow
        </button>
        <button type="submit" name="decision" value="deny" className="btn btn-secondary">
          Cancel
        </button>
      </form>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg-sidebar)] px-4 py-10 sm:px-6">
      <div className="w-full max-w-[480px]">
        <BrandLockup className="mb-8 justify-center" />
        <div className="card px-6 py-8 sm:px-10 sm:py-10">
          <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">{title}</h1>
          <div className="mt-3 text-base text-[var(--color-text-muted)]">{children}</div>
        </div>
      </div>
    </div>
  );
}
