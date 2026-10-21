"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/admin/StatusBadge";
import { formatMoney } from "@/components/records/format";
import { BoardIcon, ListIcon } from "@/components/records/icons";
import type { DealStage } from "@/lib/store/types";
import { updateDealStageAction, deleteDealAction } from "./actions";
import DealCard, { StageMenu, Touch } from "./DealCard";
import { STAGE_COPY, type PipelineRow } from "./pipeline";

// The pipeline: a board by stage (Attio/Pipedrive), or the same deals as a list. Columns carry
// their count and total; cards answer "what next" without opening. Lost deals fold away under
// the board so the four live columns get the width.

const BOARD_STAGES: DealStage[] = ["inquiry", "proposal", "negotiation", "won"];

interface PipelineClientProps {
  rows: PipelineRow[];
  view: "board" | "list";
  nowMs: number;
  demo: boolean;
}

function ViewToggle({ view, demo }: { view: "board" | "list"; demo: boolean }) {
  const href = (v: string) => `/admin/deals?view=${v}${demo ? "&demo" : ""}`;
  const item = (v: "board" | "list", label: string, icon: React.ReactNode) => (
    <Link
      href={href(v)}
      aria-current={view === v ? "page" : undefined}
      className={`inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] px-4 text-[15px] transition-colors ${
        view === v ? "bg-[var(--color-bg-secondary)] text-[var(--color-text)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
  return (
    <nav aria-label="Pipeline view" className="inline-flex gap-1 rounded-[10px] bg-[var(--color-bg-card)] p-1">
      {item("board", "Board", <BoardIcon />)}
      {item("list", "List", <ListIcon />)}
    </nav>
  );
}

export default function PipelineClient({ rows, view, nowMs, demo }: PipelineClientProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<DealStage | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function moveDeal(id: string, stage: DealStage) {
    const current = rows.find((r) => r.deal.id === id);
    if (demo || !current || current.deal.stage === stage) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateDealStageAction(id, stage);
        router.refresh();
      } catch {
        setError(`Couldn't move ${current.deal.businessName}. Nothing changed; try again.`);
      }
    });
  }

  function handleDelete(id: string, name: string) {
    if (demo || !confirm(`Delete the ${name} deal? This can't be undone.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteDealAction(id);
        router.refresh();
      } catch {
        setError(`Couldn't delete ${name}. Try again.`);
      }
    });
  }

  const lost = rows.filter((r) => r.deal.stage === "lost");
  const cardProps = (row: PipelineRow) => ({
    row,
    nowMs,
    busy,
    readOnly: demo,
    dragging: draggingId === row.deal.id,
    onMove: moveDeal,
    onDelete: handleDelete,
    onDragStart: setDraggingId,
    onDragEnd: () => {
      setDraggingId(null);
      setOverStage(null);
    },
  });

  return (
    <div>
      <div className="mb-6">
        <ViewToggle view={view} demo={demo} />
      </div>

      {error && (
        <p role="alert" className="mb-4 text-[15px] text-[var(--color-hot)]">
          {error}
        </p>
      )}

      {view === "board" ? (
        <>
          <div className="sm:-mx-6 sm:overflow-x-auto sm:px-6 sm:pb-2 lg:mx-0 lg:px-0">
            <div className="grid grid-cols-1 gap-4 sm:auto-cols-[minmax(272px,1fr)] sm:grid-flow-col sm:grid-cols-none">
              {BOARD_STAGES.map((stage) => {
                const stageRows = rows.filter((r) => r.deal.stage === stage);
                const total = stageRows.reduce((sum, r) => sum + r.deal.value, 0);
                const over = overStage === stage && draggingId !== null;
                return (
                  <section
                    key={stage}
                    aria-labelledby={`stage-${stage}`}
                    onDragOver={(e) => {
                      if (!draggingId) return;
                      e.preventDefault();
                      setOverStage(stage);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverStage((cur) => (cur === stage ? null : cur));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggingId) moveDeal(draggingId, stage);
                      setDraggingId(null);
                      setOverStage(null);
                    }}
                    className={`rounded-[14px] sm:min-h-[240px] p-2 transition-[background-color,box-shadow] duration-150 ${
                      over ? "bg-white/[0.035] shadow-[inset_0_0_0_1px_var(--color-steel)]" : "bg-white/[0.015]"
                    }`}
                  >
                    <header className="px-2 pt-2 pb-4">
                      <div className="flex items-center gap-2.5">
                        <i aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px]" style={{ background: STAGE_COPY[stage].swatch }} />
                        <h2 id={`stage-${stage}`} className="text-[15px] font-semibold text-[var(--color-text)]">
                          {STAGE_COPY[stage].label}
                        </h2>
                        <span className="tabular text-sm text-[var(--color-text-dim)]">{stageRows.length}</span>
                      </div>
                      <p
                        className={`tabular mt-2 text-[24px] leading-none font-light tracking-[-0.02em] ${
                          stage === "won" && total > 0 ? "text-[var(--color-success)]" : "text-[var(--color-steel)]"
                        }`}
                      >
                        {formatMoney(total)}
                      </p>
                    </header>
                    <div className="space-y-2">
                      {stageRows.map((row) => (
                        <DealCard key={row.deal.id} {...cardProps(row)} />
                      ))}
                      {stageRows.length === 0 && (
                        <p className="rounded-[12px] px-3 py-8 text-center text-[15px] text-[var(--color-text-dim)] shadow-[inset_0_0_0_1px_var(--color-border)]">
                          {draggingId ? "Drop here" : "Nothing here"}
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>

          {lost.length > 0 && (
            <section aria-labelledby="lost-heading" className="mt-6">
              <button
                type="button"
                onClick={() => setShowLost((v) => !v)}
                aria-expanded={showLost}
                className="btn-quiet inline-flex items-center gap-2"
                id="lost-heading"
              >
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className={`transition-transform duration-150 ${showLost ? "rotate-90" : ""}`}>
                  <path d="M4.5 3 7.5 6l-3 3" />
                </svg>
                {showLost ? "Hide" : "Show"} lost deals ({lost.length})
              </button>
              {showLost && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {lost.map((row) => (
                    <DealCard key={row.deal.id} {...cardProps(row)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        <DealList rows={rows} nowMs={nowMs} busy={busy} readOnly={demo} onMove={moveDeal} />
      )}
    </div>
  );
}

interface DealListProps {
  rows: PipelineRow[];
  nowMs: number;
  busy: boolean;
  readOnly: boolean;
  onMove: (id: string, stage: DealStage) => void;
}

const ORDER: DealStage[] = ["negotiation", "proposal", "inquiry", "won", "lost"];

function DealList({ rows, nowMs, busy, readOnly, onMove }: DealListProps) {
  if (rows.length === 0) {
    return <p className="card p-8 text-center text-[15px] text-[var(--color-text-muted)]">No deals yet. Open one from a lead&apos;s record.</p>;
  }
  const sorted = [...rows].sort((a, b) => ORDER.indexOf(a.deal.stage) - ORDER.indexOf(b.deal.stage) || b.deal.value - a.deal.value);
  const total = rows.filter((r) => r.deal.stage !== "lost" && r.deal.stage !== "won").reduce((s, r) => s + r.deal.value, 0);
  const grid = "lg:grid lg:grid-cols-[minmax(0,1.3fr)_150px_120px_minmax(0,1.5fr)_150px_96px] lg:items-center lg:gap-5";

  return (
    <div className="card px-4 sm:px-6">
      <div className={`hidden border-b border-[var(--color-border)] py-3 text-sm text-[var(--color-text-dim)] ${grid}`}>
        <span>Deal</span>
        <span>Stage</span>
        <span className="text-right">Value</span>
        <span>Next step</span>
        <span>Last touch</span>
        <span className="sr-only">Move</span>
      </div>
      <ul>
        {sorted.map((row) => {
          const { deal } = row;
          const open = deal.stage !== "won" && deal.stage !== "lost";
          return (
            <li key={deal.id} className={`border-b border-[var(--color-border)] py-4 last:border-0 ${grid} ${deal.stage === "lost" ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3 lg:block">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold text-[var(--color-text)]">
                    {deal.fromLeadId ? (
                      <Link href={`/admin/leads/${deal.fromLeadId}`} className="hover:underline">
                        {deal.businessName}
                      </Link>
                    ) : (
                      deal.businessName
                    )}
                  </p>
                  {row.contact && <p className="truncate text-sm text-[var(--color-text-muted)]">{row.contact}</p>}
                </div>
                <p className="tabular shrink-0 text-[16px] text-[var(--color-text)] lg:hidden">{deal.value > 0 ? formatMoney(deal.value) : "No price"}</p>
              </div>
              <div className="mt-2 lg:mt-0">
                <StatusBadge status={deal.stage} variant="deal" />
              </div>
              <p className="tabular hidden text-right text-[16px] text-[var(--color-text)] lg:block">
                {deal.value > 0 ? formatMoney(deal.value) : <span className="text-[var(--color-text-dim)]">No price</span>}
              </p>
              <p className={`mt-2 line-clamp-2 text-[15px] lg:mt-0 ${row.nextStep ? "text-[var(--color-text)]" : "text-[var(--color-text-dim)]"}`}>
                {row.nextStep || "No next step"}
              </p>
              <div className="mt-3 flex items-center justify-between gap-3 lg:contents">
                <Touch iso={row.lastTouch} nowMs={nowMs} open={open} />
                <StageMenu row={row} disabled={busy || readOnly} onMove={onMove} className="lg:justify-self-end" />
              </div>
            </li>
          );
        })}
      </ul>
      <div className={`flex justify-between border-t border-[var(--color-border-bright)] py-3 text-[15px] ${grid}`}>
        <span className="text-[var(--color-text-muted)]">Open total</span>
        <span className="hidden lg:block" />
        <span className="tabular text-right text-[var(--color-text)]">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
