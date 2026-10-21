"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import LocalDate from "@/components/admin/LocalDate";
import type { EmailDraft } from "@/lib/store/drafts";
import type { EmailAccount } from "@/lib/store/messages";
import Composer from "./Composer";
import { BackIcon } from "./icons";

interface DraftPaneProps {
  draft: EmailDraft;
  accounts: EmailAccount[];
  defaultAccountId: string;
  backHref: string;
  demo: boolean;
}

/** A drafted reply or follow-up: what they wrote, then the draft, ready to edit and send. */
export default function DraftPane({ draft, accounts, defaultAccountId, backHref, demo }: DraftPaneProps) {
  const router = useRouter();
  const who = draft.contactName || draft.businessName;
  const title = draft.kind === "reply" ? `Reply to ${who}` : `Follow-up ${draft.followUpNumber ?? ""} to ${who}`.replace("  ", " ");
  const done = () => router.push(backHref, { scroll: false });

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-5 pt-5 pb-4 sm:px-8 sm:pt-6">
        <Link href={backHref} scroll={false} className="btn btn-secondary btn-sm -ml-1 lg:hidden" aria-label="Back to drafts">
          <BackIcon />
          Back
        </Link>
        <h2 className="mt-4 text-[22px] leading-[1.3] font-semibold tracking-[-0.01em] text-[var(--color-text)] sm:text-[24px] lg:mt-0">{title}</h2>
        <p className="mt-1.5 text-[15px] text-[var(--color-text-muted)]">
          {draft.businessName} · drafted <LocalDate iso={draft.createdAt} options={{ weekday: "short", hour: "numeric", minute: "2-digit" }} /> ·{" "}
          <Link href={`/admin/leads/${draft.leadId}`} className="btn-quiet text-[15px]">
            Open lead record
          </Link>
        </p>
        {draft.error && <p className="mt-2 text-[15px] text-[var(--color-hot)]">The last try didn&apos;t send: {draft.error}</p>}
      </header>

      <div className="px-5 sm:px-8">
        {draft.replyingTo ? (
          <blockquote className="border-l-2 border-[var(--color-border-bright)] py-0.5 pl-5">
            <p className="text-[16.5px] leading-[1.6] whitespace-pre-wrap text-[var(--color-text)]">{draft.replyingTo.body.trim() || "(no text)"}</p>
            <footer className="mt-2 text-[14px] text-[var(--color-text-muted)]">
              {who}, <LocalDate iso={draft.replyingTo.at} options={{ weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />
            </footer>
          </blockquote>
        ) : (
          <p className="text-[16px] leading-relaxed text-[var(--color-text-muted)]">
            {who} hasn&apos;t answered yet. This nudge goes on the same thread as your last email.
          </p>
        )}
      </div>

      <section aria-label="Draft" className="mt-6 px-3 pb-5 sm:px-6">
        <Composer
          key={draft.id}
          mode="draft"
          draftId={draft.id}
          accounts={accounts}
          defaultAccountId={defaultAccountId}
          initial={{ to: draft.to, cc: "", bcc: "", subject: draft.subject, body: draft.body }}
          replyToMessageId={draft.replyToMessageId}
          leadId={draft.leadId}
          demo={demo}
          compactHeader
          onSent={done}
          onDiscarded={done}
        />
      </section>
    </div>
  );
}
