/**
 * Campaign mail one mailbox may send per team day, across all its campaigns. Same rule as the
 * sender (send-campaigns/route.ts MAILBOX_DAILY_CAP): CAMPAIGN_MAILBOX_DAILY_CAP, default 40.
 */
export function mailboxDailyCap(): number {
  const n = Number(process.env.CAMPAIGN_MAILBOX_DAILY_CAP);
  return Number.isInteger(n) && n > 0 ? n : 40;
}
