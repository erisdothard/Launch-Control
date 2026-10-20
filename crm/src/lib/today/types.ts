// Shapes the Today page passes from the server to its client components, plus the one date helper
// both sides use. Nothing here touches the database, so client components can import it.
import type { EmailDraft } from "@/lib/store/drafts";

export interface MeetingItem {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  leadId: string | null;
  leadName: string | null;
  /** A call link or Outlook link to open, when there is one. */
  joinUrl: string | null;
  location: string;
}

export interface ReplyItem {
  leadId: string;
  businessName: string;
  contactName: string | null;
  /** Their last message, when the thread has one. */
  wroteAt: string | null;
  wroteSubject: string;
  snippet: string;
  /** The AI-drafted reply waiting on this lead, if any. */
  draft: { id: string; body: string } | null;
}

export interface FollowUpItem {
  leadId: string;
  businessName: string;
  line: string;
  nextAction: string;
  followUpOn: string | null;
  /** A drafted follow-up waiting on this lead, if any. */
  draft: { id: string; subject: string; body: string } | null;
}

export interface InquiryItem {
  leadId: string;
  businessName: string;
  email: string;
  phone: string;
  note: string;
}

export interface PipelineCounts {
  leads: number;
  customers: number;
  hotProspects: number;
}

export interface TodayData {
  today: string;
  dateLabel: string;
  meetings: MeetingItem[];
  outlookError: boolean;
  replies: ReplyItem[];
  /** Leads that need a reply beyond the cards shown. */
  moreReplies: number;
  followUps: FollowUpItem[];
  inquiries: InquiryItem[];
  waitingDrafts: EmailDraft[];
  pipeline: PipelineCounts;
  /** Replies + follow-ups + inquiries + drafts waiting: the "N things need you" number. */
  attention: number;
}

/** YYYY-MM-DD plus n days, with no zone involved. */
export function addDaysISO(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
