// Activity details were once written with record ids ("→ customer 3f2a…-… (deal won)"). Show them as
// words. New entries are written without ids; this covers the rows already in the table.
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function humanDetail(detail: string | undefined): string {
  if (!detail) return "";
  return detail
    .replace(/→\s*customer\s+[0-9a-f-]{36}/gi, "became a customer")
    .replace(/→\s*deal\b/gi, "a deal was opened")
    .replace(/from lead\s+[0-9a-f-]{36}/gi, "from a lead")
    .replace(UUID, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
