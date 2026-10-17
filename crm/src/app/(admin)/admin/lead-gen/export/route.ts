import { getLeads } from "@/lib/store/leads";
import { AUTOMATED_LEAD_SOURCE } from "@/lib/store/types";
import { readSignals } from "@/lib/leadgen/factors";
import { parseLeadGenFilters } from "../filters";

const COLUMNS = [
  "score",
  "business",
  "segment",
  "city",
  "state",
  "contact_name",
  "contact_title",
  "email",
  "phone",
  "website",
  "status",
  "why",
  "outreach_hook",
  "booking_tech",
  "phrases",
] as const;

function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

// Same filters as the page, so "Export" downloads exactly what's on screen.
// Lives under /admin, so the auth middleware and RLS both apply.
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const leads = await getLeads({ source: AUTOMATED_LEAD_SOURCE, sortByScore: true, ...parseLeadGenFilters(params) });

  const rows = leads.map((lead) => {
    const p = lead.prospect;
    const signals = readSignals(p?.signals ?? null);
    return [
      p?.score,
      lead.businessName,
      p?.segment,
      p?.city,
      p?.state,
      p?.contactName,
      p?.contactTitle,
      lead.email,
      lead.phone,
      p?.website,
      lead.status,
      p?.scoreReason,
      p?.outreachHook,
      signals.bookingTech.join("; "),
      signals.phrases.join("; "),
    ]
      .map(csvCell)
      .join(",");
  });

  const body = [COLUMNS.join(","), ...rows].join("\r\n");
  const date = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="launch-control-prospects-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
