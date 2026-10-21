// Who an email goes out as. Max's mailbox (maxwell@) and its alias (eris@) are both rows in
// email_accounts; each carries the person who signs it. Pure helpers, safe in client components.
import type { SignatureInput } from "@/lib/email/signature";

export interface SenderAccount {
  id: string;
  provider: string;
  address: string;
  signatureName: string;
  signatureTitle: string;
  signaturePhone: string;
  status: string;
  mailbox?: string | null;
}

const DEFAULT_LOCAL = "maxwell@";

/**
 * The people you can send as: connected Outlook addresses (a disconnected one stays listed so the
 * choice never disappears; sending from it explains what to do). Max first, then the aliases.
 * With no Outlook connected, any other connected address.
 */
export function senderOptions<T extends SenderAccount>(accounts: T[]): T[] {
  const live = accounts.filter((a) => a.status !== "disabled");
  const outlook = live.filter((a) => a.provider === "outlook");
  const pool = outlook.length ? outlook : live;
  const rank = (a: T) => (a.address.toLowerCase().startsWith(DEFAULT_LOCAL) ? 0 : a.mailbox ? 2 : 1);
  return [...pool].sort((a, b) => rank(a) - rank(b));
}

/** The preferred sender when it's on offer, otherwise Max, otherwise the first one that can send. */
export function defaultSenderId(options: SenderAccount[], preferred?: string | null): string {
  if (preferred && options.some((a) => a.id === preferred)) return preferred;
  const max = options.find((a) => a.address.toLowerCase().startsWith(DEFAULT_LOCAL));
  return (max ?? options.find((a) => a.status === "active") ?? options[0])?.id ?? "";
}

/** "Maxwell Hartmann", or the address when nobody signs it. */
export function senderName(a: SenderAccount): string {
  return a.signatureName.trim() || a.address;
}

/** The signature this address signs with, or null when no person is set on it. */
export function signatureOf(a: SenderAccount | undefined): SignatureInput | null {
  if (!a?.signatureName.trim()) return null;
  return { name: a.signatureName, title: a.signatureTitle, address: a.address, phone: a.signaturePhone };
}

export function cannotSendReason(a: SenderAccount | undefined): string | null {
  if (!a) return "Connect Outlook in Settings first.";
  if (a.status === "needs_reconnect") return `${a.address} needs reconnecting in Settings before it can send.`;
  if (a.status !== "active") return `${a.address} can't send right now. Check it in Settings.`;
  return null;
}
