// Email attachments: the one set of limits and the one validator, shared by the Inbox composer,
// the mass email composer, their server actions, and sendEmail. No imports, so client components
// and node's test runner can load it.

export interface EmailAttachment {
  name: string;
  /** Object path in the private "email-attachments" storage bucket. */
  path: string;
  size: number;
  type: string;
}

export const ATTACHMENT_BUCKET = "email-attachments";
/** Per file. The bucket's own file_size_limit matches (migration 20261021000040). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Per email. Exchange takes 35 MB a message after base64; keep well under it. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_MB = MAX_FILE_BYTES / (1024 * 1024);
export const MAX_TOTAL_MB = MAX_TOTAL_ATTACHMENT_BYTES / (1024 * 1024);

/** Folders the composers upload into: the Inbox's "outbound/<uuid>/<name>", mass email's "campaigns/<uuid>/<name>". */
export const ATTACHMENT_PREFIXES = ["outbound/", "campaigns/"] as const;

/**
 * Only files one of our composers uploaded; refuse any other path, any ".." segment, and any type
 * or name that could smuggle a header into the MIME part.
 */
export function validAttachment(f: EmailAttachment): boolean {
  return (
    typeof f.path === "string" &&
    ATTACHMENT_PREFIXES.some((p) => f.path.startsWith(p)) &&
    !f.path.split("/").includes("..") &&
    f.path.length < 500 &&
    typeof f.name === "string" &&
    f.name.length > 0 &&
    f.name.length <= 200 &&
    !/[\r\n]/.test(f.name) &&
    Number.isInteger(f.size) &&
    f.size >= 0 &&
    f.size <= MAX_FILE_BYTES &&
    typeof f.type === "string" &&
    (f.type === "" || /^[\w.+-]+\/[\w.+-]+$/.test(f.type))
  );
}
