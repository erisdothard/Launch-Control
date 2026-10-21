"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { signaturePreviewHtml } from "@/lib/email/signature";
import { senderName, signatureOf, type SenderAccount } from "./sender";

// The two controls every composer shares: who it goes out as, and whether it's signed. The
// preview is the real signatureHtml for the selected sender, in a white panel like the inbox
// it lands in, so what Max sees is what the other person gets.

interface SendAsSwitchProps {
  options: SenderAccount[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** "inline" puts the label beside it like the composer's To and Subject; "stacked" above it. */
  layout?: "inline" | "stacked";
}

/** "Send as": one segment per person (name, then address). Arrow keys move between them. */
export function SendAsSwitch({ options, value, onChange, disabled, layout = "inline" }: SendAsSwitchProps) {
  const labelId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const at = Math.max(0, options.findIndex((a) => a.id === value));

  function onKey(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (at + step + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  }

  if (options.length === 0) return null;
  const selected = options[at];

  return (
    <div className={layout === "inline" ? "flex flex-col gap-1.5 sm:flex-row sm:gap-3" : "flex flex-col gap-1.5"}>
      <span
        id={labelId}
        className={layout === "inline" ? "shrink-0 text-[15px] text-[var(--color-text-dim)] sm:w-[68px] sm:pt-[13px]" : "text-[14px] text-[var(--color-text-dim)]"}
      >
        Send as
      </span>
      {/* Side by side only when the full name and address both fit; otherwise one per row. */}
      <div className="@container min-w-0 flex-1">
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          className={`grid gap-1 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1 ${options.length > 1 ? "@min-[36rem]:grid-cols-2" : ""} ${
            options.length > 2 ? "@min-[52rem]:grid-cols-3" : ""
          }`}
        >
          {options.map((a, i) => {
            const on = a.id === selected.id;
            return (
              <button
                key={a.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                disabled={disabled}
                onClick={() => onChange(a.id)}
                onKeyDown={onKey}
                className={`flex min-w-0 items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-left transition-[background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-steel)] ${
                  on
                    ? "bg-[var(--color-bg-card)] shadow-[inset_0_0_0_1px_var(--color-steel)]"
                    : "hover:bg-[var(--color-bg-hover)] hover:shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] ${on ? "border-[var(--color-steel)]" : "border-[var(--color-text-dim)]"}`}
                >
                  {on && <span className="h-2 w-2 rounded-full bg-[var(--color-steel)]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[15.5px] leading-[1.35] font-semibold ${on ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
                    {senderName(a)}
                  </span>
                  <span className="block truncate text-[14px] leading-[1.35] text-[var(--color-text-dim)]">{a.address}</span>
                  {a.status !== "active" && <span className="block text-[14px] leading-[1.35] text-[var(--color-hot)]">Not connected</span>}
                </span>
              </button>
            );
          })}
        </div>
        {selected.status !== "active" && (
          <p className="mt-1.5 text-[14.5px] text-[var(--color-hot)]">
            Outlook needs signing in again before this can send.{" "}
            <a href="/admin/settings#email-accounts" className="underline underline-offset-2 hover:text-[var(--color-text)]">
              Reconnect in Settings
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

// Horizontal padding of the white panel (px-5), taken off the room the signature has.
const PANEL_PAD_X = 20;

/** The exact signature that goes out, laid out at full size and scaled down only to fit. */
export function SignaturePreview({ account, label }: { account: SenderAccount | undefined; label?: string }) {
  const sig = signatureOf(account);
  const html = sig ? signaturePreviewHtml(sig) : "";
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0, height: 0 });

  useEffect(() => {
    const outer = wrap.current;
    const content = inner.current;
    if (!outer || !content) return;
    const measure = () => {
      const width = content.offsetWidth;
      const room = outer.clientWidth - PANEL_PAD_X * 2;
      const scale = width && room > 0 ? Math.min(1, room / width) : 1;
      setFit({ scale, width: width * scale, height: content.offsetHeight * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(outer);
    ro.observe(content);
    return () => ro.disconnect();
  }, [html]);

  if (!sig) return null;
  return (
    <div ref={wrap} role="img" aria-label={label ?? `Signature for ${sig.name}`}>
      {/* A white card the size of the signature, like the bottom of the email it lands in. */}
      <div className="w-fit max-w-full rounded-[var(--radius-md)] bg-white px-5 py-4">
        <div className="overflow-hidden" style={{ width: fit.width || undefined, height: fit.height || undefined }}>
          {/* signatureHtml escapes every field; this is the same markup that goes out. */}
          <div
            ref={inner}
            inert
            className="w-max origin-top-left [&_img]:max-w-none"
            style={{ transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>
    </div>
  );
}

interface SignatureToggleProps {
  account: SenderAccount | undefined;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  /** Extra classes on the preview, e.g. to hide it where a full email preview sits beside it. */
  previewClassName?: string;
}

/** "Add signature" switch, then the live preview of the selected sender's signature while it's on. */
export function SignatureToggle({ account, on, onChange, disabled, previewClassName = "" }: SignatureToggleProps) {
  const id = useId();
  const sig = signatureOf(account);
  const hint = !on ? "This email goes without a signature." : sig ? `Signed as ${sig.name}, right under your message.` : "";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={on}
          disabled={disabled}
          onClick={() => onChange(!on)}
          className="group inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] py-1 pr-1 text-[15.5px] text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-steel)]"
        >
          <span
            aria-hidden="true"
            className={`relative inline-block h-6 w-10 shrink-0 rounded-full transition-colors duration-150 ${
              on ? "bg-[var(--color-steel)]" : "bg-[var(--color-bg-secondary)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] group-hover:shadow-[inset_0_0_0_1px_var(--color-text-dim)]"
            }`}
          >
            <span
              className={`absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-full transition-transform duration-150 ease-[var(--ease-out-expo)] ${
                on ? "translate-x-4 bg-[var(--color-bg-primary)]" : "bg-[var(--color-text-dim)]"
              }`}
            />
          </span>
          Add signature
        </button>
        {hint && <span className="text-[14px] text-[var(--color-text-dim)]">{hint}</span>}
      </div>
      {on &&
        (sig ? (
          <div className={`mt-2.5 ${previewClassName}`}>
            <SignaturePreview account={account} />
          </div>
        ) : (
          <p className="mt-2 text-[14.5px] text-[var(--color-text-muted)]">
            Nobody signs {account?.address ?? "this address"} yet.{" "}
            <a href="/admin/settings#email-accounts" className="underline underline-offset-2 hover:text-[var(--color-text)]">
              Add a signature in Settings
            </a>
            .
          </p>
        ))}
    </div>
  );
}
