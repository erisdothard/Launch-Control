"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DEAL_STAGES, type Deal, type DealStage } from "@/lib/store/types";
import { updateDealStageAction, deleteDealAction } from "./actions";

const STAGE_META: Record<DealStage, { label: string; header: string; dot: string }> = {
  inquiry: { label: "Inquiry", header: "bg-[var(--color-steel)]/10 text-[var(--color-steel)]", dot: "bg-[var(--color-steel)]" },
  proposal: { label: "Proposal", header: "bg-purple-400/10 text-purple-300", dot: "bg-purple-400" },
  negotiation: { label: "Negotiation", header: "bg-amber-400/10 text-amber-300", dot: "bg-amber-400" },
  won: { label: "Won", header: "bg-emerald-400/10 text-emerald-300", dot: "bg-[var(--color-accent)]" },
  lost: { label: "Lost", header: "bg-red-400/10 text-red-300", dot: "bg-red-400" },
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface DealsKanbanClientProps {
  deals: Deal[];
}

export default function DealsKanbanClient({ deals }: DealsKanbanClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);

  function moveDeal(id: string, stage: DealStage) {
    startTransition(async () => {
      await updateDealStageAction(id, stage);
      router.refresh();
    });
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteDealAction(id);
      router.refresh();
    });
  }

  function handleDrop(stage: DealStage) {
    setDragOverStage(null);
    if (draggingId) moveDeal(draggingId, stage);
    setDraggingId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-5">
      {DEAL_STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage === stage);
        const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);
        const meta = STAGE_META[stage];
        const isDragOver = dragOverStage === stage;

        return (
          <div
            key={stage}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverStage(stage);
            }}
            onDragLeave={() => setDragOverStage((cur) => (cur === stage ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(stage);
            }}
            className={`min-h-[200px] rounded-[2px] border p-3 transition-colors ${
              isDragOver
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/[0.04]"
                : "border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
            }`}
          >
            <div className={`mb-3 flex items-center justify-between rounded-[2px] px-3 py-2 ${meta.header}`}>
              <span className="text-xs font-semibold">{meta.label}</span>
              <span className="text-xs font-medium">{stageDeals.length}</span>
            </div>
            {stageValue > 0 && (
              <p className="mb-3 px-1 text-xs text-[var(--color-text-dim)]">{currencyFormatter.format(stageValue)}</p>
            )}

            <div className="space-y-2">
              {stageDeals.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDraggingId(deal.id)}
                  onDragEnd={() => setDraggingId(null)}
                  className={`cursor-grab rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3 transition-opacity active:cursor-grabbing ${
                    draggingId === deal.id ? "opacity-40" : "opacity-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--color-text)]">{deal.businessName}</p>
                    <button
                      type="button"
                      onClick={() => handleDelete(deal.id, deal.businessName)}
                      className="shrink-0 rounded-[2px] p-1 text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-400"
                      aria-label={`Delete ${deal.businessName}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 4h10M6.5 4V2.5h3V4M6 7v4M10 7v4M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1l.5-9" />
                      </svg>
                    </button>
                  </div>
                  {deal.value > 0 && (
                    <p className="mt-1 text-xs font-medium text-[var(--color-text-muted)]">
                      {currencyFormatter.format(deal.value)}
                    </p>
                  )}
                  {deal.notes && <p className="mt-1.5 line-clamp-2 text-xs text-[var(--color-text-dim)]">{deal.notes}</p>}

                  {/* Keyboard/no-drag fallback for moving stages */}
                  <select
                    value={deal.stage}
                    onChange={(e) => moveDeal(deal.id, e.target.value as DealStage)}
                    aria-label={`Move ${deal.businessName} to a different stage`}
                    className="mt-2 w-full rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]/50"
                  >
                    {DEAL_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {STAGE_META[s].label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {stageDeals.length === 0 && (
                <p className="px-1 py-4 text-center text-xs text-[var(--color-text-dim)]">No deals</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
