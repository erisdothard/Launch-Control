// Shapes the composer shares with its server actions and pages. Types and constants only, so client
// components can import this without pulling server code into the browser bundle.
import type { EmailAttachment } from "@/lib/email/attachments";
import type { Candidate } from "./audience";

export type { EmailAttachment };

export interface ComposerAccount {
  id: string;
  address: string;
  displayName: string;
  provider: string;
  signatureName: string;
  signatureTitle: string;
  signaturePhone: string;
  /** "active", or "needs_reconnect" while Outlook wants a fresh sign-in. */
  status: string;
  mailbox: string | null;
}

export interface ComposerTemplate {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
}

export interface RecipientEdit {
  subject?: string;
  body?: string;
}

export interface FollowUpSettings {
  days: number;
  subject: string;
  body: string;
}

export type SendWhen = { mode: "now" } | { mode: "schedule"; date: string; time: string };

/** Everything the composer holds, as sent to the save action. The server re-checks all of it. */
export interface CampaignPayload {
  /** Set when continuing a saved draft: saving updates it instead of making a new one. */
  draftId: string | null;
  name: string;
  accountId: string;
  /** The "Add signature" switch: sign every email with the sender's signature. */
  includeSignature: boolean;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  candidates: Candidate[];
  /** Recipient keys included despite the recent-contact rule. */
  overrides: string[];
  /** Per-recipient subject/body, keyed by recipient key (their address). */
  edits: Record<string, RecipientEdit>;
  skipContactedDays: number;
  when: SendWhen;
  perMinute: number;
  followUp: FollowUpSettings | null;
}

/** What the composer opens with: leads picked on the Leads page, or a campaign to copy or continue. */
export interface ComposerPrefill {
  draftId: string | null;
  name: string;
  accountId: string | null;
  includeSignature: boolean;
  subject: string;
  body: string;
  attachments: EmailAttachment[];
  candidates: Candidate[];
  edits: Record<string, RecipientEdit>;
  skipContactedDays: number;
  perMinute: number;
  followUp: FollowUpSettings | null;
  /** Where the prefill came from, in words, shown above step 1. */
  note: string;
}

export const DEFAULT_PER_MINUTE = 10;
export const MAX_PER_MINUTE = 30;
export const MAX_RECIPIENTS = 2000;
// One set of limits for every composer: src/lib/email/attachments.ts.
export { ATTACHMENT_BUCKET, MAX_FILE_BYTES as MAX_ATTACHMENT_BYTES, MAX_FILE_MB, MAX_TOTAL_ATTACHMENT_BYTES, MAX_TOTAL_MB } from "@/lib/email/attachments";
export const MAX_ATTACHMENTS = 8;
/** Lists longer than this travel from the Leads page by sessionStorage, not the URL. */
export const URL_LEAD_LIMIT = 40;
export const HANDOFF_KEY = "lc:mass-email-leads";

export const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  paused: "Paused",
  sent: "Sent",
  cancelled: "Cancelled",
};
