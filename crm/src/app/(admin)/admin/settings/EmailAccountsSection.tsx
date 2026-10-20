"use client";

import { useState, useTransition } from "react";
import type { EmailAccount } from "@/lib/store/messages";
import { addBusinessAddressAction, removeEmailAccountAction, setDisplayNameAction } from "./emailActions";

interface EmailAccountsSectionProps {
  accounts: EmailAccount[];
  sendingDomain: string;
  resendReady: boolean;
  gmailReady: boolean;
  gmailResult: string | null;
  outlookReady: boolean;
  outlookResult: string | null;
}

const OUTLOOK_RESULT: Record<string, { text: string; good: boolean }> = {
  connected: { text: "Outlook connected. Every address on the mailbox can now send, and replies sync every couple of minutes.", good: true },
  cancelled: { text: "Outlook connection cancelled.", good: false },
  "no-refresh-token": { text: "Microsoft didn't grant offline access. Try connecting again.", good: false },
  "bad-state": { text: "That sign-in link expired. Try connecting again.", good: false },
  "not-configured": { text: "Outlook isn't set up on the server yet.", good: false },
  "save-failed": { text: "Couldn't save the connection. Try again.", good: false },
  failed: { text: "Outlook connection failed. Try again.", good: false },
};

const PROVIDER_LABEL = { gmail: "Gmail", resend: "Business address", outlook: "Outlook" } as const;

const GMAIL_RESULT: Record<string, { text: string; good: boolean }> = {
  connected: { text: "Gmail connected. Replies on CRM threads will sync every couple of minutes.", good: true },
  cancelled: { text: "Gmail connection cancelled.", good: false },
  "no-refresh-token": { text: "Google didn't grant offline access. Try connecting again.", good: false },
  "bad-state": { text: "That sign-in link expired. Try connecting again.", good: false },
  "not-configured": { text: "Gmail isn't set up on the server yet.", good: false },
  "save-failed": { text: "Couldn't save the connection. Try again.", good: false },
  failed: { text: "Gmail connection failed. Try again.", good: false },
};

const inputClass =
  "rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50";

function AccountRow({ account }: { account: EmailAccount }) {
  const [name, setName] = useState(account.displayName);
  const [signer, setSigner] = useState(account.signatureName);
  const [title, setTitle] = useState(account.signatureTitle);
  const dirty = name !== account.displayName || signer !== account.signatureName || title !== account.signatureTitle;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Failed");
    });
  }

  return (
    <li className="flex flex-col gap-3 border-b border-[var(--color-border)] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium text-[var(--color-text)]">{account.address}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">
          {PROVIDER_LABEL[account.provider]}
          {account.mailbox ? ` alias on ${account.mailbox}` : ""} · added by {account.connectedBy}
          {account.status === "needs_reconnect" && <span className="text-[var(--color-livery-red)]"> · needs reconnecting</span>}
        </p>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label={`From name for ${account.address}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="From name, e.g. Launch Control"
          className={`${inputClass} w-44`}
          disabled={pending}
        />
        <input
          aria-label={`Signature name for ${account.address}`}
          value={signer}
          onChange={(e) => setSigner(e.target.value)}
          placeholder="Signed by, e.g. Maxwell Hartmann"
          className={`${inputClass} w-52`}
          disabled={pending}
        />
        <input
          aria-label={`Signature title for ${account.address}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title in signature"
          className={`${inputClass} w-56`}
          disabled={pending}
        />
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => run(() => setDisplayNameAction(account.id, name, title, signer))}
          className="rounded-[2px] border border-[var(--color-border-bright)] px-3 py-2 text-xs text-[var(--color-text)] disabled:opacity-40"
        >
          Save
        </button>
        {account.status === "needs_reconnect" && (
          <a href={account.provider === "outlook" ? "/api/outlook/connect" : "/api/gmail/connect"} className="rounded-[2px] border border-[var(--color-accent)] px-3 py-2 text-xs text-[var(--color-accent)]">
            Reconnect
          </a>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => removeEmailAccountAction(account.id))}
          className="px-2 py-2 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-livery-red)]"
        >
          Remove
        </button>
      </div>
    </li>
  );
}

export default function EmailAccountsSection({
  accounts,
  sendingDomain,
  resendReady,
  gmailReady,
  gmailResult,
  outlookReady,
  outlookResult,
}: EmailAccountsSectionProps) {
  const [local, setLocal] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const visible = accounts.filter((a) => a.status !== "disabled");
  const notice = outlookResult ? OUTLOOK_RESULT[outlookResult] : gmailResult ? GMAIL_RESULT[gmailResult] : null;
  const outlookConnected = visible.some((a) => a.provider === "outlook" && !a.mailbox && a.status === "active");

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addBusinessAddressAction(local, displayName);
      if (!result.ok) setError(result.error);
      else {
        setLocal("");
        setDisplayName("");
      }
    });
  }

  return (
    <section id="email-accounts" aria-labelledby="email-heading" className="mt-6 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 sm:p-6">
      <h2 id="email-heading" className="label-mono text-[var(--color-steel)]">
        Email
      </h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">Addresses the team can send from on a lead&apos;s Messages panel.</p>

      {notice && (
        <p role="status" className={`mt-4 text-sm ${notice.good ? "text-emerald-300" : "text-red-400"}`}>
          {notice.text}
        </p>
      )}

      {visible.length > 0 && <ul className="mt-4">{visible.map((a) => <AccountRow key={a.id} account={a} />)}</ul>}

      {outlookReady && (
        <div className="mt-6">
          <p className="text-sm font-medium text-[var(--color-text)]">Microsoft 365 (Outlook)</p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Sign in as the shared mailbox. Its aliases are added too, mail goes out from the real mailbox (it shows in Outlook&apos;s Sent
            folder) and CRM meetings appear on its calendar.
          </p>
          <a
            href="/api/outlook/connect"
            className="mt-3 inline-flex items-center rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]"
          >
            {outlookConnected ? "Reconnect Outlook" : "Connect Outlook"}
          </a>
        </div>
      )}

      {(resendReady || gmailReady) && (
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Business address</p>
          {resendReady ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="flex items-center">
                  <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="max" className={`${inputClass} w-28`} disabled={pending} />
                  <span className="px-2 text-sm text-[var(--color-text-muted)]">@{sendingDomain}</span>
                </div>
                <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Max Hartmann" className={`${inputClass} w-44`} disabled={pending} />
                <button
                  type="button"
                  onClick={add}
                  disabled={pending || !local.trim()}
                  className="rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            </>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-text-dim)]">Waiting on the domain&apos;s email setup.</p>
          )}
        </div>
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">Gmail</p>
          {gmailReady ? (
            <a
              href="/api/gmail/connect"
              className="mt-2 inline-flex items-center rounded-[2px] border border-[var(--color-border-bright)] px-4 py-2 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Connect your Gmail
            </a>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-text-dim)]">Waiting on the Google sign-in setup.</p>
          )}
        </div>
      </div>
      )}
    </section>
  );
}
