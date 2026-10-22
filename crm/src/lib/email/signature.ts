// The house signature appended to outbound email, and the HTML body it sits under.
// Tables and inline styles only: Outlook, Gmail and Apple Mail all render them the same.

const SITE = "https://golaunchcontrol.com";
// Mark beside a two-line wordmark, 750x165 transparent PNG. The dark parts carry a thin white edge
// so the logo stays legible when a mail app paints a dark background.
// Sent mail embeds it (cid:) so it shows even where remote images are blocked; the URL is the
// fallback for providers that can't attach inline, and the CRM serves its own copy for previews.
export const LOGO_CID = "lc-signature-logo";
// The name as a Michroma PNG (nameImage.ts). Outlook mail embeds it (cid:); other mail and the CRM's
// previews load it from the CRM by the sending row's id.
export const NAME_CID = "lc-signature-name";
const NAME_URL = "https://crm.golaunchcontrol.com/api/email/signature-name";
const NAME_H = 17;
const LOGO_URL = "https://crm.golaunchcontrol.com/brand/launch-control-email-mark-v2.png";
const PREVIEW_LOGO = "/brand/launch-control-email-mark-v2.png";
const LOGO_W = 114;
const LOGO_H = 25;
const COMPANY = "Launch Control";
// Client demos (NEXT_PUBLIC_DEMO_MODE=1) sign as the demo's own company: its name, no Launch Control
// logo. NEXT_PUBLIC_DEMO_COMPANY names it on the demo deployment; the real CRM never sets either.
const DEMO_COMPANY = process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? (process.env.NEXT_PUBLIC_DEMO_COMPANY ?? "").trim() : "";

export type LogoSource = "cid" | "url" | "preview";

/** The drawn name for a cid: send; width and height in CSS px from renderNameImage. */
export interface NameImageRef {
  width: number;
  height: number;
}

export interface SignatureInput {
  /** The email_accounts row, so previews and remote mail can fetch the name image. */
  accountId?: string;
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

const FONT = "font-family:Arial,Helvetica,sans-serif;";
// The name is set in the wordmark's face. The @font-face below loads it in Apple Mail, iOS Mail and
// Outlook for Mac; Gmail and Outlook for Windows strip it and show Arial. Michroma has one weight,
// so the name is regular, like the wordmark, not a synthesised bold.
const NAME_FONT = "font-family:Michroma,'Eurostile','Bank Gothic',Arial,Helvetica,sans-serif;";
const MICHROMA_WOFF2 = "https://fonts.gstatic.com/s/michroma/v21/PN_zRfy9qWD8fEagAPg9pTn5_PDb.woff2";
const FONT_FACE = `<style>@font-face{font-family:Michroma;font-style:normal;font-weight:400;src:url(${MICHROMA_WOFF2}) format('woff2');}</style>`;
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

// Logo (the only link to the site) | thin gray rule | the person (Eris, 2026-10-21): name, title,
// then email and phone on one line. The phone is plain text, not a tel: link. Narrow (about 420px)
// so it never wraps or clips in a narrow reading pane. The rule is the text column's left border.
export function signatureHtml(
  { accountId, name, title, address, phone, lines }: SignatureInput,
  source: LogoSource = "url",
  nameImage?: NameImageRef
): string {
  const mail = escapeHtml(address);
  const link = `color:${INK};text-decoration:none;`;
  const personName = escapeHtml(name.trim());
  const nameStyle = `${NAME_FONT}font-size:15px;line-height:21px;color:${INK};`;
  // Image when it can be reached: inline for a cid send, by URL for the rest. Alt text is the name.
  const nameSrc = source === "cid" && nameImage ? `cid:${NAME_CID}` : source !== "cid" && accountId ? `${source === "preview" ? "" : NAME_URL.replace(/\/api.*$/, "")}/api/email/signature-name?account=${encodeURIComponent(accountId)}` : "";
  const nameCell = nameSrc
    ? `<img src="${nameSrc}" alt="${personName}" height="${nameImage?.height ?? NAME_H}"${nameImage ? ` width="${nameImage.width}"` : ""} style="display:block;height:${nameImage?.height ?? NAME_H}px;width:${nameImage ? `${nameImage.width}px` : "auto"};border:0;outline:none;${nameStyle}">`
    : personName;
  const contact = [`<a href="mailto:${mail}" style="${link}">${mail}</a>`, phone?.trim() ? escapeHtml(phone.trim()) : ""]
    .filter(Boolean)
    .join(`<span style="color:${GRAY};padding:0 6px;">&middot;</span>`);
  // One 4px step between every row, so nothing reads as a separate block.
  const GAP = "padding-top:4px;";
  const rows = [
    line(nameCell, nameSrc ? "" : nameStyle),
    title.trim() ? line(escapeHtml(title.trim()), `${GAP}font-size:13px;line-height:17px;color:${GRAY};`) : "",
    line(contact, `${GAP}font-size:13px;line-height:17px;color:${INK};`),
    ...smallLines(lines).map((l) => line(escapeHtml(l), `${GAP}font-size:11px;line-height:15px;color:${GRAY};`, true)),
  ].join("");
  const logoCell = DEMO_COMPANY
    ? ""
    : `<td valign="middle" style="padding:0 14px 0 0;vertical-align:middle;"><a href="${SITE}" style="text-decoration:none;"><img src="${logoSrc(source)}" width="${LOGO_W}" height="${LOGO_H}" alt="Launch Control" style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;outline:none;"></a></td>`;
  const rule = DEMO_COMPANY ? "" : "padding:0 0 0 14px;border-left:2px solid #6b7178;";
  return `${FONT_FACE}<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;${FONT}color:${INK};">
<tr>
${logoCell}
<td valign="middle" style="${rule}vertical-align:middle;"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">${rows}</table></td>
</tr>
</table>`;
}

export function signatureText({ name, title, address, phone, lines }: SignatureInput): string {
  return ["--", name.trim(), title.trim(), [address, phone?.trim() ?? ""].filter(Boolean).join("  ·  "), DEMO_COMPANY || "golaunchcontrol.com", ...smallLines(lines)]
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
export function emailHtml(body: string, signature: SignatureInput, logo: LogoSource = "url", nameImage?: NameImageRef): string {
  const { own, quoted } = splitQuoted(body);
  const quotedHtml = quoted
    ? `\n<br>\n<div style="${BODY_STYLE}color:#41474e;">${paragraphsHtml(quoted)}</div>`
    : "";
  return `<div style="${BODY_STYLE}">${paragraphsHtml(own)}</div>
<br>
${signatureHtml(signature, logo, nameImage)}${quotedHtml}`;
}

/** Plain-text body as HTML with no signature. */
export function plainHtml(body: string): string {
  return `<div style="${BODY_STYLE}">${paragraphsHtml(body.replace(/\r\n/g, "\n"))}</div>`;
}
