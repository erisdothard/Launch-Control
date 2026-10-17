// Email settings from the environment. Each provider is optional; the CRM shows a setup note
// instead of a send option when one isn't configured.
export const emailConfig = {
  resendKey: process.env.RESEND_API_KEY ?? "",
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? "",
  sendingDomain: (process.env.EMAIL_SENDING_DOMAIN ?? "golaunchcontrol.com").toLowerCase(),
  replyDomain: (process.env.EMAIL_REPLY_DOMAIN ?? "reply.golaunchcontrol.com").toLowerCase(),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
};

export const resendEnabled = () => Boolean(emailConfig.resendKey);
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
