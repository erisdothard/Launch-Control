import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { outlookEnabled } from "@/lib/email/config";
import { outlookAuthUrl } from "@/lib/email/outlook";
import { currentCrmUserEmail } from "@/lib/email/session";

const STATE_COOKIE = "outlook_oauth_state";

// Starts "Connect Outlook": a CRM user signs in to the shared Microsoft 365 mailbox.
export async function GET(request: NextRequest) {
  if (!outlookEnabled()) return NextResponse.redirect(new URL("/admin/settings?outlook=not-configured", request.url));
  if (!(await currentCrmUserEmail())) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL("/api/outlook/callback", request.url).toString();
  const response = NextResponse.redirect(outlookAuthUrl(state, redirectUri));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/outlook",
    maxAge: 600,
  });
  return response;
}
