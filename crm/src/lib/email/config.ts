// Email settings from the environment. Each provider is optional; the CRM shows a setup note
// instead of a send option when one isn't configured.
export const emailConfig = {
  resendKey: process.env.RESEND_API_KEY ?? "",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
  sendingDomain: (process.env.EMAIL_SENDING_DOMAIN ?? "golaunchcontrol.com").toLowerCase(),
  replyDomain: (process.env.EMAIL_REPLY_DOMAIN ?? "reply.golaunchcontrol.com").toLowerCase(),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  msClientId: process.env.MS_CLIENT_ID ?? "",
  msClientSecret: process.env.MS_CLIENT_SECRET ?? "",
  msTenantId: process.env.MS_TENANT_ID ?? "",
  // App-only mode: the CRM signs in as its own app registration (client credentials) and works on
  // this one mailbox. No user sign-in, so no refresh token for Microsoft's MFA rules to revoke.
  msAppMailbox: (process.env.MS_APP_MAILBOX ?? "").trim().toLowerCase(),
  // The zone all-day calendar events are pinned to when they're copied to Outlook.
  teamTimeZone: process.env.TEAM_TIME_ZONE ?? "America/Chicago",
};

export const resendEnabled = () => Boolean(emailConfig.resendKey);
export const outlookEnabled = () => Boolean(emailConfig.msClientId && emailConfig.msClientSecret && emailConfig.msTenantId);
/** Whether Outlook runs as the app itself (client credentials) instead of a signed-in user. */
export const outlookAppOnly = () => outlookEnabled() && Boolean(emailConfig.msAppMailbox);
export const gmailEnabled = () => Boolean(emailConfig.googleClientId && emailConfig.googleClientSecret);

// Replies to a business-address email go to lead+<lead id>@<reply domain>, so the inbound
// webhook knows which conversation they belong to without parsing headers.
export function replyAddressFor(leadId: string): string {
  return `lead+${leadId}@${emailConfig.replyDomain}`;
}

const REPLY_ADDRESS = /lead\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

export function leadIdFromAddresses(addresses: string[]): string | null {
  for (const address of addresses) {
    const match = REPLY_ADDRESS.exec(address);
    if (match) return match[1].toLowerCase();
  }
  return null;
}
