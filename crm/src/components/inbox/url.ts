import type { InboxFolder } from "@/lib/store/messages";

// The Inbox keeps everything in the URL (folder, search, page, open thread or draft, composer),
// so Back works on phones and a link to a conversation can be shared.
export interface InboxState {
  folder: InboxFolder;
  q?: string;
  page?: number;
  thread?: string;
  draft?: string;
  compose?: boolean;
  demo?: boolean;
}

export const FOLDERS: InboxFolder[] = ["inbox", "needs", "drafts", "sent", "archive"];

export function parseFolder(value: string | undefined): InboxFolder {
  return FOLDERS.includes(value as InboxFolder) ? (value as InboxFolder) : "inbox";
}

export function inboxHref(state: InboxState): string {
  const p = new URLSearchParams();
  if (state.folder !== "inbox") p.set("folder", state.folder);
  if (state.q) p.set("q", state.q);
  if (state.page) p.set("page", String(state.page));
  if (state.thread) p.set("thread", state.thread);
  if (state.draft) p.set("draft", state.draft);
  if (state.compose) p.set("compose", "1");
  if (state.demo) p.set("demo", "1");
  const qs = p.toString();
  return qs ? `/admin/inbox?${qs}` : "/admin/inbox";
}

/** "Dana Reyes" -> "DR"; an address -> its first two letters. */
export function initials(name: string): string {
  const words = name.replace(/<.*?>/g, "").replace(/[^\p{L}\p{N}\s@.]/gu, " ").trim().split(/\s+/);
  if (words.length >= 2 && !words[0].includes("@")) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/** Numbers as words in ledes ("Four people"), digits past twelve. */
export function countWord(n: number): string {
  return WORDS[n] ?? String(n);
}
