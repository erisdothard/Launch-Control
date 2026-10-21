// The house signature appended to outbound email, and the HTML body it sits under.
// Tables and inline styles only: Outlook, Gmail and Apple Mail all render them the same.

const SITE = "https://golaunchcontrol.com";
// Mark beside a two-line wordmark, 750x165 transparent PNG. The dark parts carry a thin white edge
// so the logo stays legible when a mail app paints a dark background.
// Sent mail embeds it (cid:) so it shows even where remote images are blocked; the URL is the
// fallback for providers that can't attach inline, and the CRM serves its own copy for previews.
export const LOGO_CID = "lc-signature-logo";
const LOGO_URL = "https://crm.golaunchcontrol.com/brand/launch-control-email-mark-v1.png";
const PREVIEW_LOGO = "/brand/launch-control-email-mark-v1.png";
const LOGO_W = 140;
const LOGO_H = 31;
const COMPANY = "Launch Control";

export type LogoSource = "cid" | "url" | "preview";

export interface SignatureInput {
  name: string;
  title: string;
  address: string;
  /** Optional phone line, e.g. "+1 646.942.0682". */
  phone?: string;
  /** Optional small-print lines, one per line (services, cities). */
  lines?: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** tel: target for a typed phone number: digits only, US numbers get +1. */
function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:+${digits}`;
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const INK = "#050607";
const GRAY = "#5b626a";

// Name, title, email and phone never wrap; only the small print may, so phones don't scroll sideways.
function line(content: string, style: string, wrap = false): string {
  return `<tr><td style="padding:0;${FONT}${wrap ? "" : "white-space:nowrap;"}${style}">${content}</td></tr>`;
}

function smallLines(lines: string | undefined): string[] {
  return (lines ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function logoSrc(source: LogoSource): string {
  return source === "cid" ? `cid:${LOGO_CID}` : source === "preview" ? PREVIEW_LOGO : LOGO_URL;
}

// Logo | thin gray rule | the person, in the order Max set (2026-10-21): name, title, email,
// LAUNCH CONTROL, phone, then small print. Narrow (about 460px) and no wide letter-spacing, so it
// never wraps or clips in a narrow reading pane. The rule is the text column's left border.
export function signatureHtml({ name, title, address, phone, lines }: SignatureInput, source: LogoSource = "url"): string {
  const mail = escapeHtml(address);
  const link = `color:${INK};text-decoration:none;`;
  const rows = [
    line(escapeHtml(name.trim()), `font-size:16px;line-height:21px;font-weight:bold;color:${INK};`),
    title.trim() ? line(escapeHtml(title.trim()), `font-size:13px;line-height:19px;color:${GRAY};padding-bottom:6px;`) : "",
    line(`<a href="mailto:${mail}" style="${link}">${mail}</a>`, `font-size:13px;line-height:19px;color:${INK};`),
    line(`<a href="${SITE}" style="${link}">LAUNCH CONTROL</a>`, `font-size:12px;line-height:19px;font-weight:bold;letter-spacing:1.5px;color:${INK};`),
    phone?.trim()
      ? line(`<a href="${telHref(phone)}" style="${link}">${escapeHtml(phone.trim())}</a>`, `font-size:13px;line-height:19px;color:${INK};`)
      : "",
    ...smallLines(lines).map((l, i) =>
      line(escapeHtml(l), `font-size:11px;line-height:16px;color:${GRAY};${i === 0 ? "padding-top:6px;" : ""}`, true)
    ),
  ].join("");
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${FONT}color:${INK};">
<tr>
<td valign="middle" style="padding:0 18px 0 0;vertical-align:middle;"><a href="${SITE}" style="text-decoration:none;"><img src="${logoSrc(source)}" width="${LOGO_W}" height="${LOGO_H}" alt="Launch Control" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;outline:none;"></a></td>
<td valign="middle" style="padding:2px 0 2px 18px;border-left:2px solid #6b7178;vertical-align:middle;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">${rows}</table></td>
</tr>
</table>`;
}

export function signatureText({ name, title, address, phone, lines }: SignatureInput): string {
  return ["--", name.trim(), title.trim(), address, "LAUNCH CONTROL (golaunchcontrol.com)", phone?.trim() ?? "", ...smallLines(lines)]
    .filter(Boolean)
    .join("\n");
}

/** signatureHtml with the logo served by the CRM itself, for previews on CRM screens. */
export function signaturePreviewHtml(input: SignatureInput): string {
  return signatureHtml(input, "preview");
}

// Where quoted text starts in a message we write: a forwarded message, or "On ... wrote:".
const QUOTE_START = /^(-{5,} ?Forwarded message ?-{5,}|On .+wrote:)\s*$/m;

/**
 * Splits a message into what the sender wrote and the quoted text under it, so the signature can
 * sit between them (as Outlook and Gmail place it). No quoted part means quoted is "".
 */
export function splitQuoted(body: string): { own: string; quoted: string } {
  const text = body.replace(/\r\n/g, "\n");
  const match = QUOTE_START.exec(text);
  if (!match) return { own: text, quoted: "" };
  return { own: text.slice(0, match.index).replace(/\s+$/, ""), quoted: text.slice(match.index) };
}

function paragraphsHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br>");
}

const BODY_STYLE = "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#050607;";

/** Plain-text body with the signature under what was written and above any quoted text. */
export function emailText(body: string, signature: SignatureInput): string {
  const { own, quoted } = splitQuoted(body);
  return [own, signatureText(signature), quoted].filter((part) => part.trim()).join("\n\n");
}

/** Plain-text body as HTML (escaped, line breaks kept), the signature under it, then any quoted text. */
export function emailHtml(body: string, signature: SignatureInput, logo: LogoSource = "url"): string {
  const { own, quoted } = splitQuoted(body);
  const quotedHtml = quoted
    ? `\n<br>\n<div style="${BODY_STYLE}color:#41474e;">${paragraphsHtml(quoted)}</div>`
    : "";
  return `<div style="${BODY_STYLE}">${paragraphsHtml(own)}</div>
<br>
${signatureHtml(signature, logo)}${quotedHtml}`;
}

/** Plain-text body as HTML with no signature. */
export function plainHtml(body: string): string {
  return `<div style="${BODY_STYLE}">${paragraphsHtml(body.replace(/\r\n/g, "\n"))}</div>`;
}
