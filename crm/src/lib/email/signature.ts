// The house signature appended to outbound email, and the HTML body it sits under.
// Tables and inline styles only: Outlook, Gmail and Apple Mail all render them the same.

const SITE = "https://golaunchcontrol.com";
const LOGO = `${SITE}/brand/launch-control-email-logo-v1.png`;
const TAGLINE = "Business development systems &middot; Nashville &middot; Miami";

export interface SignatureInput {
  name: string;
  title: string;
  address: string;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function signatureHtml({ name, title, address }: SignatureInput): string {
  const titleRow = title.trim()
    ? `<tr><td style="padding:0 0 10px 0;font-size:13px;line-height:18px;color:#5b626a;">${escapeHtml(title.trim())}</td></tr>`
    : "";
  const stripe = [
    [50, "#f0c419"],
    [30, "#f07d1a"],
    [20, "#e3261d"],
  ]
    .map(([w, c]) => `<td width="${w}" height="3" style="width:${w}px;height:3px;line-height:3px;font-size:0;background:${c};">&nbsp;</td>`)
    .join("");
  const mail = escapeHtml(address);
  return `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#050607;">
<tr><td style="padding:0 0 2px 0;font-size:16px;line-height:20px;font-weight:bold;color:#050607;">${escapeHtml(name.trim())}</td></tr>
${titleRow}
<tr><td style="padding:0 0 10px 0;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>${stripe}</tr></table></td></tr>
<tr><td style="padding:0 0 10px 0;"><a href="${SITE}" style="text-decoration:none;"><img src="${LOGO}" width="200" height="25" alt="Launch Control" style="display:block;width:200px;height:25px;border:0;"></a></td></tr>
<tr><td style="padding:0;font-size:13px;line-height:19px;color:#050607;"><a href="mailto:${mail}" style="color:#050607;text-decoration:none;">${mail}</a></td></tr>
<tr><td style="padding:0;font-size:12px;line-height:18px;color:#7a8189;">${TAGLINE}</td></tr>
</table>`;
}

export function signatureText({ name, title, address }: SignatureInput): string {
  return ["--", name.trim(), title.trim(), "Launch Control", address, "Nashville · Miami"]
    .filter(Boolean)
    .join("\n");
}

/** Plain-text body as HTML (escaped, line breaks kept), with the signature under it. */
export function emailHtml(body: string, signature: SignatureInput): string {
  const paragraphs = escapeHtml(body).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#050607;">${paragraphs}</div>
<br>
${signatureHtml(signature)}`;
}
