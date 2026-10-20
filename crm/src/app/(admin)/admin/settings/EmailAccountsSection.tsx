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

const noticeClass = (good: boolean) =>
  good
    ? "border border-[var(--color-ok)] bg-[var(--color-ok-bg)] text-[var(--color-ok)]"
    : "border border-[var(--color-danger)] bg-[var(--color-danger-bg)] text-[var(--color-danger)]";

function AccountRow({ account }: { account: EmailAccount }) {
  const [name, setName] = useState(account.displayName);
  const [signer, setSigner] = useState(account.signatureName);
  const [title, setTitle] = useState(account.signatureTitle);
  const dirty = name !== account.displayName || signer !== account.signatureName || title !== account.signatureTitle;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Failed");
    });
  }

  return (
    <li className="flex flex-col gap-4 border-b border-[var(--color-border)] py-5 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-base font-semibold text-[var(--color-text)]">{account.address}</p>
        <p className="t-small mt-0.5 text-[var(--color-text-muted)]">
          {PROVIDER_LABEL[account.provider]}
          {account.mailbox ? ` alias on ${account.mailbox}` : ""} · added by {account.connectedBy}
          {account.status === "needs_reconnect" && <span className="text-[var(--color-danger)]"> · needs reconnecting</span>}
        </p>
        {error && (
          <p role="alert" className="t-small mt-1 text-[var(--color-danger)]">
            {error}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor={`from-${account.id}`} className="t-small mb-1 block text-[var(--color-text-muted)]">
            From name
          </label>
          <input id={`from-${account.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Launch Control" className="input" disabled={pending} />
        </div>
        <div>
          <label htmlFor={`signer-${account.id}`} className="t-small mb-1 block text-[var(--color-text-muted)]">
            Signed by
          </label>
          <input id={`signer-${account.id}`} value={signer} onChange={(e) => setSigner(e.target.value)} placeholder="Maxwell Hartmann" className="input" disabled={pending} />
        </div>
        <div>
          <label htmlFor={`title-${account.id}`} className="t-small mb-1 block text-[var(--color-text-muted)]">
            Title in signature
          </label>
          <input id={`title-${account.id}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Owner" className="input" disabled={pending} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => run(() => setDisplayNameAction(account.id, name, title, signer))}
          className="btn btn-secondary"
        >
          Save
        </button>
        {account.status === "needs_reconnect" && (
          <a href={account.provider === "outlook" ? "/api/outlook/connect" : "/api/gmail/connect"} className="btn btn-primary">
            Reconnect
          </a>
        )}
        {confirmingRemove ? (
          <>
            <span className="t-small ml-auto text-[var(--color-text-muted)]">Remove this address?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeEmailAccountAction(account.id))}
              className="btn-quiet text-[var(--color-danger)] hover:text-[var(--color-danger)]"
            >
              Yes, remove
            </button>
            <button type="button" disabled={pending} onClick={() => setConfirmingRemove(false)} className="btn-quiet">
              Keep
            </button>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => setConfirmingRemove(true)} className="btn-quiet ml-auto">
            Remove
          </button>
        )}
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
    <section id="email-accounts" aria-labelledby="email-heading" className="card mt-6 max-w-3xl p-5 sm:p-6">
      <h2 id="email-heading" className="label-mono text-[var(--color-steel)]">
        Email
      </h2>
      <p className="mt-2 text-base text-[var(--color-text-muted)]">Addresses the team can send from on a lead&apos;s page.</p>

      {notice && (
        <p role="status" className={`mt-4 rounded-[2px] px-4 py-3 text-base ${noticeClass(notice.good)}`}>
          {notice.text}
        </p>
      )}

      {visible.length > 0 && <ul className="mt-2">{visible.map((a) => <AccountRow key={a.id} account={a} />)}</ul>}

      {outlookReady && (
        <div className="mt-6 border-t border-[var(--color-border)] pt-6">
          <p className="text-base font-semibold text-[var(--color-text)]">Microsoft 365 (Outlook)</p>
          <p className="mt-1 text-base text-[var(--color-text-muted)]">
            Sign in as the shared mailbox. Its aliases are added too, mail goes out from the real mailbox (it shows in Outlook&apos;s Sent folder) and
            CRM meetings appear on its calendar.
          </p>
          <a href="/api/outlook/connect" className="btn btn-primary mt-3">
            {outlookConnected ? "Reconnect Outlook" : "Connect Outlook"}
          </a>
        </div>
      )}

      {(resendReady || gmailReady) && (
        <div className="mt-6 grid grid-cols-1 gap-6 border-t border-[var(--color-border)] pt-6 lg:grid-cols-2">
          <div>
            <p className="text-base font-semibold text-[var(--color-text)]">Business address</p>
            {resendReady ? (
              <>
                <div className="mt-3 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <label htmlFor="new-address-local" className="sr-only">
                      Address
                    </label>
                    <input id="new-address-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="max" className="input" disabled={pending} />
                    <span className="t-small shrink-0 text-[var(--color-text-muted)]">@{sendingDomain}</span>
                  </div>
                  <label htmlFor="new-address-name" className="sr-only">
                    From name
                  </label>
                  <input id="new-address-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="From name, e.g. Max Hartmann" className="input" disabled={pending} />
                  <button type="button" onClick={add} disabled={pending || !local.trim()} className="btn btn-primary self-start">
                    Add address
                  </button>
                </div>
                {error && (
                  <p role="alert" className="t-small mt-2 text-[var(--color-danger)]">
                    {error}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1 text-base text-[var(--color-text-dim)]">Waiting on the domain&apos;s email setup.</p>
            )}
          </div>
          <div>
            <p className="text-base font-semibold text-[var(--color-text)]">Gmail</p>
            {gmailReady ? (
              <a href="/api/gmail/connect" className="btn btn-secondary mt-3">
                Connect your Gmail
              </a>
            ) : (
              <p className="mt-1 text-base text-[var(--color-text-dim)]">Waiting on the Google sign-in setup.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
