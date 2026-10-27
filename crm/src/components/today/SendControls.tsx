"use client";

import { useId } from "react";
import { senderName, signatureOf, type SenderAccount } from "@/components/inbox/sender";

// Who a drafted email goes out as, and whether it's signed, in one line. Today keeps the full
// signature preview off the screen: the Inbox composer and Settings show it in full.

interface SendControlsProps {
  senders: SenderAccount[];
  senderId: string;
  onSender: (id: string) => void;
  includeSignature: boolean;
  onIncludeSignature: (on: boolean) => void;
  disabled?: boolean;
}

export default function SendControls({ senders, senderId, onSender, includeSignature, onIncludeSignature, disabled }: SendControlsProps) {
  const fromId = useId();
  const signId = useId();
  if (senders.length === 0) return null;
  const selected = senders.find((a) => a.id === senderId) ?? senders[0];
  const sig = signatureOf(selected);
  // getEmailAccounts already treats a stale sign-in flag as active in app-only mode, so this only
  // shows when the address really can't send.
  const blocked = selected.status !== "active";

  return (
    <div className="flex flex-col gap-2 text-[15px] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <label htmlFor={fromId} className="shrink-0 text-[var(--color-text-dim)]">
          Send as
        </label>
        {senders.length > 1 ? (
          <select
            id={fromId}
            value={selected.id}
            onChange={(e) => onSender(e.target.value)}
            disabled={disabled}
            className="field min-w-0 flex-1 py-2 sm:w-auto sm:flex-none"
          >
            {senders.map((a) => (
              <option key={a.id} value={a.id}>
                {senderName(a)} · {a.address}
              </option>
            ))}
          </select>
        ) : (
          <span id={fromId} className="truncate text-[var(--color-text)]">
            {senderName(selected)} · {selected.address}
          </span>
        )}
      </div>
      {sig && (
        <label htmlFor={signId} className="flex cursor-pointer items-center gap-2.5 text-[var(--color-text-muted)]">
          <input
            id={signId}
            type="checkbox"
            checked={includeSignature}
            onChange={(e) => onIncludeSignature(e.target.checked)}
            disabled={disabled}
            className="h-[18px] w-[18px] accent-[var(--color-steel)]"
          />
          Sign as {sig.name}
        </label>
      )}
      {blocked && (
        <p className="w-full text-[14.5px] text-[var(--color-hot)]">
          {selected.address} can&apos;t send right now.{" "}
          <a href="/admin/settings#email-accounts" className="underline underline-offset-2 hover:text-[var(--color-text)]">
            Check it in Settings
          </a>
        </p>
      )}
    </div>
  );
}
