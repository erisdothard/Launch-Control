// AI apps allowed to connect to the CRM, by where they send the person back after sign-in. Anyone
// can register an app under any name, so the name proves nothing; the return address does.
const TRUSTED_HOSTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "claude.com"];

export function isTrustedRedirect(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    return url.protocol === "https:" && TRUSTED_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
