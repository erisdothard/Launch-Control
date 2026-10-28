"use client";

import { useState, useTransition } from "react";
import LocalDate from "@/components/admin/LocalDate";
import { SignaturePreview } from "@/components/inbox/SendAs";
import { senderOptions } from "@/components/inbox/sender";
import type { EmailAccount } from "@/lib/store/messages";
import { addBusinessAddressAction, removeEmailAccountAction, setDisplayNameAction } from "./emailActions";

interface EmailAccountsSectionProps {
  accounts: EmailAccount[];
  /** Signature phone per account id (email_accounts.signature_phone). */
  phones: Record<string, string>;
  sendingDomain: string;
  resendReady: boolean;
  gmailReady: boolean;
  gmailResult: string | null;
  outlookReady: boolean;
  outlookResult: string | null;
  /**
   * Outlook runs as the CRM's own app (client credentials): no user sign-in, so nothing to
   * reconnect, and every address sends through this one mailbox over SMTP.
   */
  appOnly: boolean;
  appMailbox: string;
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

interface SignatureDraft {
  name: string;
  title: string;
  phone: string;
  lines: string;
}

const labelClass = "mb-1.5 block text-sm text-[var(--color-text-dim)]";

/** A provider error ("AADSTS50076: ...") in words Max can act on. */
function plainReason(raw: string): string {
  if (/AADSTS5007[69]|multi-?factor|\bMFA\b/i.test(raw)) return "Microsoft requires multi-factor sign-in";
  if (/invalid_grant|AADSTS700082|AADSTS70008|refresh token.*expired|expired/i.test(raw)) return "the sign-in expired";
  if (/AADSTS65001|consent/i.test(raw)) return "Microsoft wants permission granted again";
  if (/AADSTS50126|password/i.test(raw)) return "the password changed";
  if (/AADSTS50057|disabled/i.test(raw)) return "the Microsoft account is turned off";
  if (/5\.7\.\d+|SmtpClientAuthentication|authentication unsuccessful/i.test(raw)) return "Microsoft refused the sign-in for sending";
  return raw.replace(/\s*\(found [^)]*\)\s*$/, "").replace(/^AADSTS\d+:\s*/, "").trim().slice(0, 140) || "Microsoft refused the connection";
}

const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };

// Errors from the old signed-in-user connection (MFA prompts, expired sign-ins). In app-only mode
// the CRM never signs in as a person, so these say nothing about whether it can send today.
const SIGN_IN_ERROR = /AADSTS|multi-?factor|\bMFA\b|invalid_grant|refresh token|expired|consent|password/i;


/** Working, or when it stopped and why, plus the one thing to do about it. */
function AccountStatus({ account, appOnly, receives }: { account: EmailAccount; appOnly: boolean; receives: boolean }) {
  const reconnect = account.provider === "outlook" ? "/api/outlook/connect" : "/api/gmail/connect";
  const lastError = appOnly && account.provider === "outlook" && account.lastError && SIGN_IN_ERROR.test(account.lastError) ? null : account.lastError;
  if (account.status === "active") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-[rgba(143,220,154,0.1)] px-3 py-1 text-sm text-[var(--color-success)]">
        <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" aria-hidden="true" />
        {receives ? "Sending · replies come into the CRM" : "Sending"}
        {lastError && account.lastErrorAt && (
          <span className="text-[var(--color-text-dim)]">
            · last problem <LocalDate iso={account.lastErrorAt} options={DAY} />: {plainReason(lastError)}
          </span>
        )}
      </span>
    );
  }
  return (
    <div className="well flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-[15px] text-[var(--color-hot)]">
        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--color-hot)] align-middle" aria-hidden="true" />
        {account.lastErrorAt ? (
          <>
            Stopped working <LocalDate iso={account.lastErrorAt} options={DAY} />
          </>
        ) : (
          "Stopped working"
        )}
        {account.lastError ? `: ${plainReason(account.lastError)}.` : "."}{" "}
        <span className="text-[var(--color-text-muted)]">Nothing sends as this address until it&apos;s reconnected.</span>
      </p>
      {account.provider !== "resend" && !(appOnly && account.provider === "outlook") && (
        <a href={reconnect} className="btn btn-secondary btn-sm shrink-0 self-start sm:self-auto">
          Reconnect
        </a>
      )}
    </div>
  );
}

/** Where this address's mail actually goes out from, and where replies to it land, in one plain sentence. */
function routeLine(account: EmailAccount, appOnly: boolean, appMailbox: string): string {
  const via = `${PROVIDER_LABEL[account.provider]}, added by ${account.connectedBy}.`;
  if (account.provider !== "outlook") return via;
  if (!appOnly) return account.mailbox ? `An alias on ${account.mailbox}. ${via}` : `The Outlook mailbox. ${via}`;
  if (account.address.toLowerCase() === appMailbox) return `The CRM's own mailbox: every email goes out through it, and its replies come back here. ${via}`;
  return `Goes out through ${appMailbox}. Replies to it land in its own Outlook, not in the CRM yet. ${via}`;
}

function initials(name: string, fallback: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback[0]?.toUpperCase() ?? "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function AccountRow({ account, phone: savedPhone, appOnly, appMailbox }: { account: EmailAccount; phone: string; appOnly: boolean; appMailbox: string }) {
  const [name, setName] = useState(account.displayName);
  const [signer, setSigner] = useState(account.signatureName);
  const [title, setTitle] = useState(account.signatureTitle);
  const [phone, setPhone] = useState(savedPhone);
  const [lines, setLines] = useState(account.signatureLines);
  const dirty =
    name !== account.displayName || signer !== account.signatureName || title !== account.signatureTitle || phone !== savedPhone || lines !== account.signatureLines;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) setError(result.error ?? "Failed");
      else after?.();
    });
  }

  function edit(set: (v: string) => void) {
    return (value: string) => {
      set(value);
      setSaved(false);
    };
  }

  function reset() {
    setName(account.displayName);
    setSigner(account.signatureName);
    setTitle(account.signatureTitle);
    setPhone(savedPhone);
    setLines(account.signatureLines);
  }

  // The preview is drawn from what's typed, so it changes with every keystroke.
  const draft: SignatureDraft = { name: signer, title, phone, lines };
  const id = account.id;
  const fromName = name.trim() || account.address;
  return (
    <li className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-border)] px-5 py-4 sm:px-7 sm:py-5">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-secondary)] font-[family-name:var(--font-display)] text-[13px] text-[var(--color-steel)] shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
        >
          {initials(signer, account.address)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[19px] font-semibold text-[var(--color-text)]">{signer.trim() || "Nobody signs this yet"}</p>
          <p className="truncate text-[15px] text-[var(--color-text-muted)]">{account.address}</p>
        </div>
        <AccountStatus
          account={account}
          appOnly={appOnly}
          receives={account.provider !== "outlook" || !appOnly || account.address.toLowerCase() === appMailbox}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="space-y-4 px-5 py-6 sm:px-7">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block" htmlFor={`signer-${id}`}>
              <span className={labelClass}>Name</span>
              <input id={`signer-${id}`} value={signer} onChange={(e) => edit(setSigner)(e.target.value)} placeholder="Maxwell Hartmann" className="field" disabled={pending} />
            </label>
            <label className="block" htmlFor={`phone-${id}`}>
              <span className={labelClass}>Phone</span>
              <input
                id={`phone-${id}`}
                type="tel"
                inputMode="tel"
                autoComplete="off"
                value={phone}
                onChange={(e) => edit(setPhone)(e.target.value)}
                placeholder="Leave empty for none"
                className="field tabular"
                disabled={pending}
              />
            </label>
            <label className="block sm:col-span-2" htmlFor={`title-${id}`}>
              <span className={labelClass}>Title</span>
              <input id={`title-${id}`} value={title} onChange={(e) => edit(setTitle)(e.target.value)} placeholder="Business Development" className="field" disabled={pending} />
            </label>
            <label className="block sm:col-span-2" htmlFor={`from-${id}`}>
              <span className={labelClass}>Name in their inbox <span className="text-[var(--color-text-dim)]/80">· who the email says it&apos;s from</span></span>
              <input id={`from-${id}`} value={name} onChange={(e) => edit(setName)(e.target.value)} placeholder="Launch Control" className="field" disabled={pending} />
            </label>
          </div>
          <label className="block" htmlFor={`lines-${id}`}>
            <span className={labelClass}>Extra lines at the bottom (optional, one per line)</span>
            <textarea
              id={`lines-${id}`}
              rows={Math.max(2, lines.split("\n").length)}
              value={lines}
              onChange={(e) => edit(setLines)(e.target.value)}
              placeholder="e.g. Miami, FL | Nashville, TN"
              className="field resize-y [field-sizing:content]"
              disabled={pending}
            />
          </label>
        </div>

        {/* What the lead actually sees: their inbox row, then the bottom of the email. */}
        <div className="border-t border-[var(--color-border)] bg-[var(--color-bg-primary)] px-5 py-6 sm:px-7 lg:border-t-0 lg:border-l">
          <p className={labelClass}>What they see</p>
          {/* Phones scroll the email sideways instead of shrinking the signature to unreadable. */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="min-w-[440px] overflow-hidden rounded-[var(--radius-md)] bg-white text-[#1f2328] shadow-[0_12px_40px_-16px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-3 border-b border-[#e6e8eb] px-4 py-3">
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e9ecef] text-[12px] font-semibold text-[#4a5159]">
                {initials(fromName, account.address)}
              </span>
              <p className="min-w-0 truncate text-[14px]">
                <span className="font-semibold">{fromName}</span>
                <span className="text-[#6a737d]"> &lt;{account.address}&gt;</span>
              </p>
            </div>
            <div className="px-4 pt-4 pb-1 text-[14px] leading-relaxed text-[#4a5159]">
              <p>Hi Sarah,</p>
              <p aria-hidden="true" className="mt-2 space-y-1.5">
                <span className="block h-2 w-[92%] rounded bg-[#eef0f2]" />
                <span className="block h-2 w-[78%] rounded bg-[#eef0f2]" />
              </p>
            </div>
            {draft.name.trim() ? (
              <div className="[&>div>div]:!rounded-none [&>div>div]:!px-4">
                <SignaturePreview
                  account={{ ...account, signatureName: draft.name, signatureTitle: draft.title, signaturePhone: draft.phone, signatureLines: draft.lines }}
                  label={`Signature preview for ${account.address}`}
                />
              </div>
            ) : (
              <p className="px-4 py-4 text-[14px] text-[#6a737d]">Type a name to see the signature here.</p>
            )}
          </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-text-dim)]">{routeLine(account, appOnly, appMailbox)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] px-5 py-4 sm:px-7">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => run(() => setDisplayNameAction(account.id, name, title, signer, phone, lines), () => setSaved(true))}
          className={`btn btn-sm disabled:!opacity-70 ${dirty ? "btn-primary" : "btn-secondary"}`}
        >
          {pending ? "Saving..." : dirty ? "Save changes" : "No changes"}
        </button>
        {dirty && !pending && (
          <button type="button" onClick={reset} className="btn-quiet text-sm">
            Undo changes
          </button>
        )}
        {saved && !dirty && (
          <span role="status" className="text-sm text-[var(--color-success)]">
            ✓ Saved. Every email from {account.address} signs this way now.
          </span>
        )}
        {error && (
          <span role="alert" className="text-sm text-[var(--color-hot)]">
            {error}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">
          {confirmRemove ? (
            <>
              <span className="text-sm text-[var(--color-text-muted)]">Stop sending as {account.address}?</span>
              <button type="button" disabled={pending} onClick={() => run(() => removeEmailAccountAction(account.id))} className="btn btn-sm btn-secondary !text-[var(--color-hot)]">
                Remove
              </button>
              <button type="button" onClick={() => setConfirmRemove(false)} className="btn-quiet text-sm">
                Keep it
              </button>
            </>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirmRemove(true)} className="btn-quiet text-sm hover:!text-[var(--color-hot)]">
              Remove address
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

export default function EmailAccountsSection({
  accounts,
  phones,
  sendingDomain,
  resendReady,
  gmailReady,
  gmailResult,
  outlookReady,
  outlookResult,
  appOnly,
  appMailbox,
}: EmailAccountsSectionProps) {
  const [local, setLocal] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Max's mailbox first, then the aliases on it, as in every Send as switch.
  const people = senderOptions(accounts);
  const visible = [...people, ...accounts.filter((a) => a.status !== "disabled" && !people.includes(a))];
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
    <section id="email-accounts" aria-labelledby="email-heading" className="space-y-5">
      <div>
        <h2 id="email-heading" className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">
          Who your emails come from
        </h2>
        <p className="mt-1.5 max-w-2xl text-base text-[var(--color-text-muted)]">
          One card per person. Pick who you are with Send as when you write, and their signature goes on the bottom.
        </p>
      </div>

      {notice && (
        <p role="status" className={`well px-4 py-3 text-base ${notice.good ? "text-[var(--color-success)]" : "text-[var(--color-hot)]"}`}>
          {notice.text}
        </p>
      )}

      {visible.length > 0 ? (
        <ul className="space-y-5">
          {visible.map((a) => (
            <AccountRow key={a.id} account={a} phone={phones[a.id] ?? a.signaturePhone} appOnly={appOnly} appMailbox={appMailbox} />
          ))}
        </ul>
      ) : (
        <p className="card p-6 text-base text-[var(--color-text-muted)]">No addresses yet. Connect Outlook below to start sending.</p>
      )}

      {outlookReady && appOnly && !resendReady && !gmailReady ? (
        // Nothing to connect or reconnect: say so in one line instead of a card of explanation.
        <p className="flex items-center gap-2 px-1 text-[15px] text-[var(--color-text-dim)]">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
          Connected through Microsoft 365. Nobody signs in, so there&apos;s nothing to reconnect.
        </p>
      ) : (
        (outlookReady || resendReady || gmailReady) && (
          <div className="card p-5 sm:p-7">
            <h3 className="text-[19px] font-semibold text-[var(--color-text)]">Add another address</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {outlookReady && appOnly && (
                <div className="well p-5">
                  <p className="text-base font-medium text-[var(--color-text)]">Microsoft 365 (Outlook)</p>
                  <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                    Connected through {appMailbox}. Nobody signs in, so there&apos;s nothing to reconnect.
                  </p>
                </div>
              )}
              {outlookReady && !appOnly && (
                <div className="well p-5">
                  <p className="text-base font-medium text-[var(--color-text)]">Microsoft 365 (Outlook)</p>
                  <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                    Sign in as the shared mailbox. Its aliases come along, sent mail shows in Outlook&apos;s Sent folder, and CRM meetings land on its calendar.
                  </p>
                  <a href="/api/outlook/connect" className="btn btn-secondary btn-sm mt-4">
                    {outlookConnected ? "Reconnect Outlook" : "Connect Outlook"}
                  </a>
                </div>
              )}
              {resendReady || gmailReady ? (
                <>
                  <div className="well p-5">
                    <p className="text-base font-medium text-[var(--color-text)]">Business address</p>
                    {resendReady ? (
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <input value={local} onChange={(e) => setLocal(e.target.value)} placeholder="max" aria-label="Address name" className="field" disabled={pending} />
                          <span className="shrink-0 text-sm text-[var(--color-text-muted)]">@{sendingDomain}</span>
                        </div>
                        <input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Name in their inbox, e.g. Launch Control"
                          aria-label="Name in their inbox for the new address"
                          className="field mt-2"
                          disabled={pending}
                        />
                        <button type="button" onClick={add} disabled={pending || !local.trim()} className="btn btn-secondary btn-sm mt-3">
                          Add address
                        </button>
                        {error && (
                          <p role="alert" className="mt-2 text-sm text-[var(--color-hot)]">
                            {error}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">Waiting on the domain&apos;s email setup.</p>
                    )}
                  </div>
                  <div className="well p-5">
                    <p className="text-base font-medium text-[var(--color-text)]">Gmail</p>
                    {gmailReady ? (
                      <a href="/api/gmail/connect" className="btn btn-secondary btn-sm mt-4">
                        Connect your Gmail
                      </a>
                    ) : (
                      <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">Waiting on the Google sign-in setup.</p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )
      )}
    </section>
  );
}
