import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { renderNameImage } from "@/lib/email/nameImage";

// Public: the signature name as a Michroma PNG, for mail that can't carry it inline (Resend, Gmail)
// and for the CRM's own previews. Keyed by the sending row, so only names on file can be drawn.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const account = request.nextUrl.searchParams.get("account") ?? "";
  if (!UUID.test(account)) return new NextResponse("Not found", { status: 404 });
  const supabase = createServiceRoleClient();
  if (!supabase) return new NextResponse("Service unavailable", { status: 503 });
  const { data, error } = await supabase.from("email_accounts").select("signature_name").eq("id", account).maybeSingle();
  if (error) return new NextResponse("Service unavailable", { status: 503 });
  const name = data?.signature_name?.trim();
  if (!name) return new NextResponse("Not found", { status: 404 });
  try {
    const image = await renderNameImage(name);
    return new NextResponse(new Uint8Array(image.png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400", "X-Robots-Tag": "noindex" },
    });
  } catch (err) {
    console.error("[signature-name] render failed", err instanceof Error ? err.message : err);
    return new NextResponse("Service unavailable", { status: 503 });
  }
}
