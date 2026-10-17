import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { leadIdFromAddresses } from "@/lib/email/config";
import { fetchReceivedEmail, verifyResendWebhook } from "@/lib/email/resend";
import { bareAddress, stripQuotedReply } from "@/lib/email/text";

// Resend inbound webhook (event email.received). Replies to business-address emails arrive at
// lead+<lead id>@<reply domain>; anything else is matched to a lead by the sender's address.
export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifyResendWebhook(body, request.headers)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string; to?: string[]; received_for?: string[]; from?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (event.type !== "email.received" || !event.data?.email_id) return NextResponse.json({ ignored: true });

  const admin = createServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const email = await fetchReceivedEmail(event.data.email_id);
  const recipients = [...(email.to ?? []), ...(email.received_for ?? []), ...(event.data.to ?? [])];
  const sender = bareAddress(email.from ?? event.data.from ?? "");

  let leadId = leadIdFromAddresses(recipients);
  if (!leadId && sender) {
    const { data } = await admin.from("leads").select("id").ilike("email", sender).limit(1).maybeSingle();
    leadId = data?.id ?? null;
  }
  if (!leadId) return NextResponse.json({ ignored: "no matching lead" });

  const { data: account } = await admin.from("email_accounts").select("id").eq("provider", "resend").limit(1).maybeSingle();
  const text = email.text ?? (email.html ?? "").replace(/<[^>]+>/g, " ");
  const { error } = await admin.from("email_messages").upsert(
    {
      lead_id: leadId,
      account_id: account?.id ?? null,
      direction: "in",
      from_address: sender,
      to_address: bareAddress(recipients[0] ?? ""),
      subject: email.subject ?? "",
      body_text: stripQuotedReply(text),
      provider: "resend",
      provider_message_id: email.id,
      message_id_header: email.message_id,
      status: "received",
    },
    { onConflict: "provider,provider_message_id", ignoreDuplicates: true },
  );
  if (error) return NextResponse.json({ error: "store failed" }, { status: 500 });
  return NextResponse.json({ stored: true });
}
