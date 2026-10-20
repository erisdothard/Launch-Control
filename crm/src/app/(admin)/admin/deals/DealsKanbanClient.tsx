"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "@/components/admin/StatusBadge";
import { DEAL_STAGES, type Deal, type DealStage } from "@/lib/store/types";
import { updateDealStageAction, deleteDealAction } from "./actions";

const STAGE_LABEL: Record<DealStage, string> = {
  inquiry: "Inquiry",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface DealsKanbanClientProps {
  deals: Deal[];
}

interface DealCardProps {
  deal: Deal;
  dragging: boolean;
  confirming: boolean;
  busy: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (stage: DealStage) => void;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
}

function DealCard({ deal, dragging, confirming, busy, onDragStart, onDragEnd, onMove, onAskRemove, onKeep, onRemove }: DealCardProps) {
  const selectId = `move-${deal.id}`;
  return (
    <li
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`card cursor-grab p-4 transition-opacity active:cursor-grabbing ${dragging ? "opacity-40" : "opacity-100"}`}
    >
      <p className="text-base font-semibold text-[var(--color-text)]">{deal.businessName}</p>
      {deal.value > 0 && <p className="t-small mt-1 font-mono text-[var(--color-text-muted)]">{currencyFormatter.format(deal.value)}</p>}
      {deal.notes && <p className="t-small mt-1.5 line-clamp-2 text-[var(--color-text-dim)]">{deal.notes}</p>}

      {/* Keyboard / no-drag way to change stage */}
      <div className="mt-3">
        <label htmlFor={selectId} className="t-small mb-1 block text-[var(--color-text-muted)]">
          Move to…
        </label>
        <select id={selectId} value={deal.stage} onChange={(e) => onMove(e.target.value as DealStage)} disabled={busy} className="input">
          {DEAL_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {confirming ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="t-small text-[var(--color-text-muted)]">Remove this deal?</span>
          <button type="button" onClick={onRemove} disabled={busy} className="btn-quiet text-[var(--color-danger)] hover:text-[var(--color-danger)]">
            Yes, remove
          </button>
          <button type="button" onClick={onKeep} disabled={busy} className="btn-quiet">
            Keep
          </button>
        </div>
      ) : (
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={onAskRemove} disabled={busy} className="btn-quiet">
            Remove
          </button>
        </div>
      )}
    </li>
  );
}

export default function DealsKanbanClient({ deals }: DealsKanbanClientProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<DealStage | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function moveDeal(id: string, stage: DealStage) {
    startTransition(async () => {
      await updateDealStageAction(id, stage);
      router.refresh();
    });
  }

  function removeDeal(id: string) {
    startTransition(async () => {
      await deleteDealAction(id);
      setConfirmingId(null);
      router.refresh();
    });
  }

  function handleDrop(stage: DealStage) {
    setDragOverStage(null);
    if (draggingId) moveDeal(draggingId, stage);
    setDraggingId(null);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {DEAL_STAGES.map((stage) => {
        const stageDeals = deals.filter((d) => d.stage === stage);
        const stageValue = stageDeals.reduce((sum, d) => sum + d.value, 0);
        const isDragOver = dragOverStage === stage;

        return (
          <section
            key={stage}
            aria-label={`${STAGE_LABEL[stage]} column`}
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
              isDragOver ? "border-[var(--color-accent-border)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
            }`}
          >
            <header className="mb-3 flex min-h-[44px] flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <StatusBadge status={stage} variant="deal" />
                <span className="t-small font-mono text-[var(--color-text-muted)]">{stageDeals.length}</span>
              </div>
              {stage === "won" && (
                <Link href="/admin/customers" className="link t-small">
                  Customers →
                </Link>
              )}
            </header>
            {stageValue > 0 && <p className="t-small mb-3 px-1 font-mono text-[var(--color-text-muted)]">{currencyFormatter.format(stageValue)}</p>}

            <ul className="space-y-3">
              {stageDeals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  dragging={draggingId === deal.id}
                  confirming={confirmingId === deal.id}
                  busy={busy}
                  onDragStart={() => setDraggingId(deal.id)}
                  onDragEnd={() => setDraggingId(null)}
                  onMove={(s) => moveDeal(deal.id, s)}
                  onAskRemove={() => setConfirmingId(deal.id)}
                  onKeep={() => setConfirmingId(null)}
                  onRemove={() => removeDeal(deal.id)}
                />
              ))}
              {stageDeals.length === 0 && <li className="t-small px-1 py-4 text-center text-[var(--color-text-dim)]">No deals here.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
