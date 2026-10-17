// Helpers shared by both providers.

/** Keep only the new part of a reply: drop quoted lines and everything from "On ... wrote:" down. */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    // "On Mon, Oct 17, 2026 at 3:00 PM Max <max@...> wrote:" (sometimes wrapped onto two lines)
    if (/^On .+wrote:\s*$/.test(line) || (/^On .+/.test(line) && /wrote:\s*$/.test(next))) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line) || /^From: .+/.test(line) && /^(Sent|Date): /.test(next)) break;
    if (line.startsWith(">")) continue;
    out.push(line);
  }
  const trimmed = out.join("\n").trim();
  return trimmed || text.trim();
}

/** Bare address out of `Name <a@b.com>`. */
export function bareAddress(value: string): string {
  const match = /<([^>]+)>/.exec(value);
  return (match ? match[1] : value).trim().toLowerCase();
}

export function isEmail(value: string): boolean {
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[a-z]{2,}$/i.test(value.trim());
}

/** "Re: " once, never "Re: Re: ". */
export function replySubject(subject: string): string {
  return /^re:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;
}
