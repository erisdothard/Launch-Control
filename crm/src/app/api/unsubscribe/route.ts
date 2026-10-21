import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { readUnsubscribeToken } from "@/lib/email/unsubscribe";

// Public: the unsubscribe link in every mass email (List-Unsubscribe). Not under /admin, so the
// admin proxy never sees it. The signed token is the only authority.
//   GET  a small confirmation page with one button (link scanners open links; they don't post).
//   POST unsubscribes: the RFC 8058 one-click post from Gmail/Outlook, or that page's button.
export const dynamic = "force-dynamic";

const secret = () => process.env.UNSUBSCRIBE_SECRET || process.env.AUTOMATION_SECRET || "";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>body{margin:0;background:#0c0d0f;color:#e8e9eb;font:16px/1.5 system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}main{max-width:440px;background:#16181b;border-radius:12px;padding:32px}h1{font-size:24px;margin:0 0 8px}p{color:#a3a7ad;margin:0 0 20px}button{font:inherit;font-weight:600;background:#f5d000;color:#0c0d0f;border:0;border-radius:10px;padding:12px 20px;cursor:pointer}button:focus-visible{outline:2px solid #fff;outline-offset:2px}</style></head><body><main>${body}</main></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

const invalid = () => page("Link not valid", "<h1>This link isn't valid</h1><p>Reply to the email with the word unsubscribe and we'll take you off the list.</p>", 400);

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const target = readUnsubscribeToken(token, secret());
  if (!target) return invalid();
  return page(
    "Unsubscribe",
    `<h1>Unsubscribe</h1><p>Stop emails from Launch Control to ${escapeHtml(target.email)}?</p><form method="post" action="/api/unsubscribe?t=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form>`
  );
}

export async function POST(request: NextRequest) {
  const target = readUnsubscribeToken(request.nextUrl.searchParams.get("t") ?? "", secret());
  if (!target) return invalid();
  const admin = createServiceRoleClient();
  if (!admin) return page("Try again", "<h1>Something went wrong</h1><p>Try again in a minute.</p>", 500);

  const { error } = await admin.from("email_suppressions").upsert({ email: target.email, reason: "opt_out" }, { onConflict: "email", ignoreDuplicates: true });
  if (error) return page("Try again", "<h1>Something went wrong</h1><p>Try again in a minute.</p>", 500);
  // The lead the email went to, and any other lead on that address.
  if (target.leadId) await admin.from("leads").update({ do_not_contact: true }).eq("id", target.leadId);
  await admin.from("leads").update({ do_not_contact: true }).ilike("email", target.email.replace(/[\\%_]/g, "\\$&"));
  return page("Unsubscribed", `<h1>You're unsubscribed</h1><p>${escapeHtml(target.email)} won't get any more emails from Launch Control.</p>`);
}
