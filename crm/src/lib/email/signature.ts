// The house signature appended to outbound email, and the HTML body it sits under.
// Tables and inline styles only: Outlook, Gmail and Apple Mail all render them the same.

const SITE = "https://golaunchcontrol.com";
// Mark beside a two-line wordmark, 750x165 transparent PNG shown at 250x55. The dark parts carry
// a thin white edge so the logo stays legible when a mail app paints a dark background.
// Served by the CRM itself (crm/public/brand), so the logo ships with the code that sends it.
const LOGO = "https://crm.golaunchcontrol.com/brand/launch-control-email-mark-v1.png";
// The CRM serves its own copy of the same file, so previews inside the CRM show the logo before
// (and regardless of) the marketing-site deploy that publishes it.
const PREVIEW_LOGO = "/brand/launch-control-email-mark-v1.png";
const COMPANY = "Launch Control";

export interface SignatureInput {
  name: string;
  title: string;
  address: string;
  /** Optional phone line, e.g. "646-942-0682". */
  phone?: string;
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

function line(content: string, style: string): string {
  return `<tr><td style="padding:0;${FONT}${style}">${content}</td></tr>`;
}

// Laid out like Max's Gmail signature: logo | thin gray rule | name, title, phone, email, company.
// The rule is the right column's left border, which Outlook, Gmail and Apple Mail all draw.
export function signatureHtml({ name, title, address, phone }: SignatureInput): string {
  const mail = escapeHtml(address);
  const rows = [
    line(escapeHtml(name.trim().toUpperCase()), `font-size:16px;line-height:22px;font-weight:bold;letter-spacing:4px;color:${INK};`),
    title.trim()
      ? line(escapeHtml(title.trim().toUpperCase()), "font-size:14px;line-height:22px;font-weight:bold;letter-spacing:1.5px;color:#5b626a;")
      : "",
    phone?.trim()
      ? line(
          `<a href="${telHref(phone)}" style="color:${INK};text-decoration:none;">${escapeHtml(phone.trim())}</a>`,
          `font-size:15px;line-height:22px;letter-spacing:0.5px;color:${INK};`
        )
      : "",
    line(`<a href="mailto:${mail}" style="color:${INK};text-decoration:none;">${mail}</a>`, `font-size:15px;line-height:22px;letter-spacing:0.5px;color:${INK};`),
    line(`<a href="${SITE}" style="color:${INK};text-decoration:none;">${COMPANY}</a>`, `font-size:15px;line-height:22px;letter-spacing:0.5px;color:${INK};`),
  ].join("");
  return `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${FONT}color:${INK};">
<tr>
<td valign="middle" style="padding:0 24px 0 0;vertical-align:middle;"><a href="${SITE}" style="text-decoration:none;"><img src="${LOGO}" width="250" height="55" alt="Launch Control" style="display:block;width:250px;height:55px;border:0;outline:none;"></a></td>
<td valign="middle" style="padding:2px 0 2px 24px;border-left:2px solid #6b7178;vertical-align:middle;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">${rows}</table></td>
</tr>
</table>`;
}

export function signatureText({ name, title, address, phone }: SignatureInput): string {
  return ["--", name.trim(), title.trim(), phone?.trim() ?? "", address, COMPANY, "golaunchcontrol.com"]
    .filter(Boolean)
    .join("\n");
}

/** signatureHtml with the logo served by the CRM itself, for previews on CRM screens. */
export function signaturePreviewHtml(input: SignatureInput): string {
  return signatureHtml(input).replace(LOGO, PREVIEW_LOGO);
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
export function emailHtml(body: string, signature: SignatureInput): string {
  const { own, quoted } = splitQuoted(body);
  const quotedHtml = quoted
    ? `\n<br>\n<div style="${BODY_STYLE}color:#41474e;">${paragraphsHtml(quoted)}</div>`
    : "";
  return `<div style="${BODY_STYLE}">${paragraphsHtml(own)}</div>
<br>
${signatureHtml(signature)}${quotedHtml}`;
}

/** Plain-text body as HTML with no signature. */
export function plainHtml(body: string): string {
  return `<div style="${BODY_STYLE}">${paragraphsHtml(body.replace(/\r\n/g, "\n"))}</div>`;
}
