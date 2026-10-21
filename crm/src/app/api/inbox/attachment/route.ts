import { NextResponse, type NextRequest } from "next/server";
import { ATTACHMENT_BUCKET } from "@/lib/email/send";
import { currentCrmUserEmail } from "@/lib/email/session";
import { outlookAccessToken } from "@/lib/email/outlookAccount";
import { graphUrl } from "@/lib/email/outlook";
import { getMessageAttachment } from "@/lib/store/messages";
import { createServiceRoleClient } from "@/lib/supabase/server";

// GET /api/inbox/attachment?m=<email_messages id>&i=<index>
// Files the CRM sent live in the private bucket: redirect to a one-minute signed URL. Files that
// arrived in Outlook stay there: stream them through Graph with the mailbox's token.
export async function GET(req: NextRequest) {
  if (!(await currentCrmUserEmail())) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const messageId = req.nextUrl.searchParams.get("m") ?? "";
  const index = Number(req.nextUrl.searchParams.get("i"));
  if (!/^[0-9a-f-]{36}$/i.test(messageId) || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "That attachment wasn't found." }, { status: 400 });
  }
  const found = await getMessageAttachment(messageId, index);
  if (!found) return NextResponse.json({ error: "That attachment wasn't found." }, { status: 404 });
  const { attachment, accountId, providerMessageId } = found;

  if (attachment.path) {
    const admin = createServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    const { data, error } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUrl(attachment.path, 60, { download: attachment.name });
    if (error || !data) return NextResponse.json({ error: "That file is no longer stored." }, { status: 404 });
    return NextResponse.redirect(data.signedUrl);
  }

  if (attachment.providerId && accountId && providerMessageId) {
    try {
      const token = await outlookAccessToken(accountId);
      const res = await fetch(
        graphUrl(`/me/messages/${encodeURIComponent(providerMessageId)}/attachments/${encodeURIComponent(attachment.providerId)}/$value`),
        { headers: { Authorization: `Bearer ${token}`, Prefer: 'IdType="ImmutableId"' }, cache: "no-store" }
      );
      if (!res.ok || !res.body) return NextResponse.json({ error: "Outlook no longer has that file." }, { status: 404 });
      const safeName = attachment.name.replace(/["\r\n\\]/g, "");
      return new NextResponse(res.body, {
        headers: {
          "Content-Type": attachment.type || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return NextResponse.json({ error: "Couldn't reach Outlook for that file. Try again." }, { status: 502 });
    }
  }
  return NextResponse.json({ error: "That attachment wasn't found." }, { status: 404 });
}
