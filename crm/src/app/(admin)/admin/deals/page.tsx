import Link from "next/link";
import AdminHeader from "@/components/admin/AdminHeader";
import { getDeals } from "@/lib/store/deals";
import { getLeadsByIds } from "@/lib/store/leads";
import { formatMoney } from "@/components/records/format";
import PipelineClient from "./DealsKanbanClient";
import { countWord, requestTime, STAGE_COPY, toPipelineRow, type PipelineRow } from "./pipeline";
import { demoPipeline } from "./demoDeals";

type View = "board" | "list";

function lede(rows: PipelineRow[]): string {
  const open = rows.filter((r) => r.deal.stage !== "won" && r.deal.stage !== "lost");
  if (open.length === 0) return "No open deals right now. Create one from a lead's record when they ask for a price.";
  const total = open.reduce((sum, r) => sum + r.deal.value, 0);
  const byStage = new Map<string, number>();
  for (const r of open) byStage.set(r.deal.stage, (byStage.get(r.deal.stage) ?? 0) + r.deal.value);
  const [topStage] = [...byStage.entries()].sort((a, b) => b[1] - a[1])[0];
  const where = STAGE_COPY[topStage as keyof typeof STAGE_COPY].label;
  const deals = open.length === 1 ? "open deal" : "open deals";
  const tail = total > 0 && byStage.size > 1 ? ` Most of it is in ${where}.` : "";
  return `${countWord(open.length)} ${deals} worth ${formatMoney(total)}.${tail} Drag a card, or use Move, to change its stage.`;
}

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ view?: string; demo?: string }> }) {
  const sp = await searchParams;
  const view: View = sp.view === "list" ? "list" : "board";
  const nowMs = requestTime();
  const demo = sp.demo !== undefined && process.env.NODE_ENV === "development";

  let rows: PipelineRow[];
  if (demo) {
    rows = demoPipeline(nowMs);
  } else {
    const deals = await getDeals();
    const leads = await getLeadsByIds(deals.map((d) => d.fromLeadId).filter((id): id is string => Boolean(id)));
    const byId = new Map(leads.map((l) => [l.id, l]));
    rows = deals.map((d) => toPipelineRow(d, d.fromLeadId ? byId.get(d.fromLeadId) : undefined));
  }

  return (
    <>
      <AdminHeader
        title="Pipeline"
        subtitle={lede(rows)}
        actions={
          <Link href="/admin/deals/new" className="btn btn-primary">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 3v10M3 8h10" />
            </svg>
            Add deal
          </Link>
        }
      />
      {demo && (
        <p className="well mb-5 px-4 py-3 text-[15px] text-[var(--color-warm)]">Demo data on a dev server. Nothing here is real or saved.</p>
      )}
      <PipelineClient rows={rows} view={view} nowMs={nowMs} demo={demo} />
    </>
  );
}
