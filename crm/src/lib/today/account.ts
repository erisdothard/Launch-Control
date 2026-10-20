import { getEmailAccounts, getThread } from "@/lib/store/messages";

/**
 * Which connected mailbox a message to this lead should go out from: the one the conversation is
 * already on, so the thread stays in one place; otherwise Outlook (Max's real mailbox), then
 * whatever else is connected. Null when nothing is connected.
 */
export async function accountFor(leadId: string): Promise<string | null> {
  const [accounts, thread] = await Promise.all([getEmailAccounts(), getThread(leadId)]);
  const active = accounts.filter((a) => a.status === "active");
  const lastOut = [...thread].reverse().find((m) => m.direction === "out" && m.accountId);
  const same = lastOut && active.find((a) => a.id === lastOut.accountId);
  if (same) return same.id;
  return (active.find((a) => a.provider === "outlook") ?? active[0])?.id ?? null;
}
