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
      <p className="text-[15px] text-[var(--color-text-muted)]">
        <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[var(--color-success)] align-middle" aria-hidden="true" />
        {receives ? "Sending, and replies sync into the CRM" : "Sending"}
        {lastError && account.lastErrorAt && (
          <span className="text-[var(--color-text-dim)]">
            {" "}
            · last problem <LocalDate iso={account.lastErrorAt} options={DAY} />: {plainReason(lastError)}
          </span>
        )}
      </p>
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

/** Where this address's mail actually goes out from, and where replies to it land. */
function routeLine(account: EmailAccount, appOnly: boolean, appMailbox: string): string {
  if (account.provider !== "outlook") return "";
  if (!appOnly) return account.mailbox ? ` · an alias on ${account.mailbox}` : " · the Outlook mailbox";
  const own = account.address.toLowerCase() === appMailbox;
  if (own) return " · the CRM's mailbox: every email goes out through it, and its replies sync here";
  return ` · goes out through ${appMailbox} with Send As. Replies to it land in its own Outlook, not in the CRM yet`;
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

  // The preview is drawn from what's typed, so it changes with every keystroke.
  const draft: SignatureDraft = { name: signer, title, phone, lines };
  const id = account.id;
  return (
    <li className="border-b border-[var(--color-border)] py-7 first:pt-3 last:border-0 last:pb-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold text-[var(--color-text)]">
            {account.signatureName.trim() ? `${account.signatureName}'s signature` : account.address}
          </p>
          <p className="mt-0.5 text-[15px] break-words text-[var(--color-text-muted)]">
            {account.address}
            {routeLine(account, appOnly, appMailbox)}
          </p>
        </div>
        <p className="text-sm text-[var(--color-text-dim)]">
          {PROVIDER_LABEL[account.provider]} · added by {account.connectedBy}
        </p>
      </div>
      <div className="mt-3">
        <AccountStatus
          account={account}
          appOnly={appOnly}
          receives={account.provider !== "outlook" || !appOnly || account.address.toLowerCase() === appMailbox}
        />
      </div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.85fr)_minmax(0,1fr)]">
        <label className="block" htmlFor={`signer-${id}`}>
          <span className={labelClass}>Signed by</span>
          <input id={`signer-${id}`} value={signer} onChange={(e) => edit(setSigner)(e.target.value)} placeholder="Maxwell Hartmann" className="field" disabled={pending} />
        </label>
        <label className="block" htmlFor={`title-${id}`}>
          <span className={labelClass}>Title</span>
          <input id={`title-${id}`} value={title} onChange={(e) => edit(setTitle)(e.target.value)} placeholder="Business Development" className="field" disabled={pending} />
        </label>
        <label className="block" htmlFor={`phone-${id}`}>
          <span className={labelClass}>Phone (optional)</span>
          <input
            id={`phone-${id}`}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => edit(setPhone)(e.target.value)}
            placeholder="No phone line"
            className="field tabular"
            disabled={pending}
          />
        </label>
        <label className="block" htmlFor={`from-${id}`}>
          <span className={labelClass}>From name in their inbox</span>
          <input id={`from-${id}`} value={name} onChange={(e) => edit(setName)(e.target.value)} placeholder="Launch Control" className="field" disabled={pending} />
        </label>
      </div>
      <label className="mt-3 block" htmlFor={`lines-${id}`}>
        <span className={labelClass}>Small print under the signature (one line each, optional)</span>
        <textarea
          id={`lines-${id}`}
          rows={2}
          value={lines}
          onChange={(e) => edit(setLines)(e.target.value)}
          placeholder={"Business Development • Client Acquisition\nMiami, FL | Nashville, TN"}
          className="field resize-y"
          disabled={pending}
        />
      </label>
      <div className="mt-5">
        <p className="mb-2 text-sm text-[var(--color-text-dim)]">
          {draft.name.trim() ? `Under every email sent as ${account.address}` : "Add who signs it to see the signature"}
        </p>
        {draft.name.trim() && (
          <SignaturePreview
            account={{ ...account, signatureName: draft.name, signatureTitle: draft.title, signaturePhone: draft.phone, signatureLines: draft.lines }}
            label={`Signature preview for ${account.address}`}
          />
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() => run(() => setDisplayNameAction(account.id, name, title, signer, phone, lines), () => setSaved(true))}
          className="btn btn-secondary btn-sm"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        {saved && !dirty && (
          <span role="status" className="text-sm text-[var(--color-success)]">
            Saved
          </span>
        )}
        {error && (
          <span role="alert" className="text-sm text-[var(--color-hot)]">
            {error}
          </span>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => removeEmailAccountAction(account.id))}
          className="btn-quiet ml-auto text-sm hover:!text-[var(--color-hot)]"
        >
          Remove
        </button>
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
    <section id="email-accounts" aria-labelledby="email-heading" className="card p-5 sm:p-8">
      <h2 id="email-heading" className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--color-steel)]">
        Email and signature
      </h2>
      <p className="mt-2 max-w-2xl text-base text-[var(--color-text-muted)]">
        Each address below is one person. When you write an email, Send as picks who it&apos;s from: their inbox shows that address&apos;s
        From name (set below), and that person&apos;s signature goes under the message unless you switch it off.
      </p>

      {notice && (
        <p role="status" className={`well mt-5 px-4 py-3 text-base ${notice.good ? "text-[var(--color-success)]" : "text-[var(--color-hot)]"}`}>
          {notice.text}
        </p>
      )}

      {visible.length > 0 ? (
        <ul className="mt-4">
          {visible.map((a) => (
            <AccountRow key={a.id} account={a} phone={phones[a.id] ?? a.signaturePhone} appOnly={appOnly} appMailbox={appMailbox} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-base text-[var(--color-text-muted)]">No addresses yet. Connect Outlook below to start sending.</p>
      )}

      {(outlookReady || resendReady || gmailReady) && (
        <div className="mt-10 border-t border-[var(--color-border)] pt-8">
          <h3 className="text-base font-semibold text-[var(--color-text)]">Connect another address</h3>
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {outlookReady && appOnly && (
              <div className="well p-5">
                <p className="text-base font-medium text-[var(--color-text)]">Microsoft 365 (Outlook)</p>
                <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                  Connected as the CRM&apos;s own app, working on {appMailbox}. Nobody signs in, so a password change or a Microsoft
                  sign-in prompt can&apos;t disconnect it, and there is nothing to reconnect.
                </p>
              </div>
            )}
            {outlookReady && !appOnly && (
              <div className="well p-5">
                <p className="text-base font-medium text-[var(--color-text)]">Microsoft 365 (Outlook)</p>
                <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                  Sign in as the shared mailbox. Its aliases are added too, mail goes out from the real mailbox (it shows in Outlook&apos;s Sent
                  folder) and CRM meetings appear on its calendar.
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
                        placeholder="From name, e.g. Launch Control"
                        aria-label="From name for the new address"
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
      )}
    </section>
  );
}
