import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { gmailEnabled } from "@/lib/email/config";
import { googleAuthUrl } from "@/lib/email/gmail";
import { currentCrmUserEmail } from "@/lib/email/session";

const GMAIL_STATE_COOKIE = "gmail_oauth_state";

// Starts "Connect Gmail": a CRM user is sent to Google's consent screen.
export async function GET(request: NextRequest) {
  if (!gmailEnabled()) return NextResponse.redirect(new URL("/admin/settings?gmail=not-configured", request.url));
  if (!(await currentCrmUserEmail())) return NextResponse.redirect(new URL("/login", request.url));

  const state = randomBytes(24).toString("base64url");
  const redirectUri = new URL("/api/gmail/callback", request.url).toString();
  const response = NextResponse.redirect(googleAuthUrl(state, redirectUri));
  response.cookies.set(GMAIL_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 600,
  });
  return response;
}
