"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { InquiryItem } from "@/lib/today/types";
import { markLeadNotAFitAction } from "../leads/actions";

interface InquiryCardProps {
  item: InquiryItem;
  onDone: (leadId: string) => void;
  onBusy: (leadId: string, busy: boolean) => void;
}

export default function InquiryCard({ item, onDone, onBusy }: InquiryCardProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const contact = [item.email, item.phone].filter(Boolean).join(" · ");

  function notAFit() {
    setError(null);
    onBusy(item.leadId, true);
    startTransition(async () => {
      try {
        await markLeadNotAFitAction(item.leadId);
        onDone(item.leadId);
      } catch {
        setError("Couldn't save that. Try again.");
      } finally {
        onBusy(item.leadId, false);
      }
    });
  }

  return (
    <li className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <Link href={`/admin/leads/${item.leadId}`} className="text-lg font-semibold text-[var(--color-text)] hover:underline">
            {item.businessName}
          </Link>
          {contact && <p className="break-words text-[var(--color-text-muted)]">{contact}</p>}
          {item.note && <p className="text-[var(--color-text)]">{item.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.email ? (
            <Link href={`/admin/leads/${item.leadId}#messages`} className="btn btn-primary">
              Email
            </Link>
          ) : (
            <Link href={`/admin/leads/${item.leadId}`} className="btn btn-primary">
              Open
            </Link>
          )}
          {item.phone && (
            <a href={`tel:${item.phone.replace(/[^\d+]/g, "")}`} className="btn-quiet">
              Call
            </a>
          )}
          <button type="button" onClick={notAFit} disabled={pending} className="btn-quiet">
            {pending ? "Saving…" : "Not a fit"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 t-small text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </li>
  );
}
