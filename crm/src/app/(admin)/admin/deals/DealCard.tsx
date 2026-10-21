"use client";

import Link from "next/link";
import { DEAL_STAGES, type DealStage } from "@/lib/store/types";
import { daysSince, formatMoney, sinceLabel, STALE_CLASS, staleness } from "@/components/records/format";
import { ClockIcon, FlagIcon, TrashIcon } from "@/components/records/icons";
import { STAGE_COPY, type PipelineRow } from "./pipeline";

// One deal: who, how much, what's next, and how long since anyone touched it. Staleness is only
// coloured while a deal is open; a won or lost deal doesn't need chasing.

interface StageMenuProps {
  row: PipelineRow;
  disabled: boolean;
  onMove: (id: string, stage: DealStage) => void;
  className?: string;
}

// A native select laid over a small "Move" button: the column already says the stage, so the card
// only needs the verb. Native means keyboard, screen readers and the phone's picker all just work.
export function StageMenu({ row, disabled, onMove, className = "" }: StageMenuProps) {
  return (
    <label
      className={`relative inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 text-sm text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] transition-[box-shadow,color] focus-within:shadow-[inset_0_0_0_1px_var(--color-accent)] hover:text-[var(--color-text)] hover:shadow-[inset_0_0_0_1px_var(--color-steel)] ${
        disabled ? "opacity-50" : ""
      } ${className}`}
    >
      Move
      <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 4.5 6 7.5l3-3" />
      </svg>
      <select
        value={row.deal.stage}
        disabled={disabled}
        aria-label={`Move ${row.deal.businessName} to another stage`}
        onChange={(e) => onMove(row.deal.id, e.target.value as DealStage)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
      >
        {DEAL_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_COPY[s].label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Touch({ iso, nowMs, open }: { iso: string; nowMs: number; open: boolean }) {
  const days = daysSince(iso, nowMs);
  const tone = open ? STALE_CLASS[staleness(days)] : STALE_CLASS.fresh;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${tone}`} title="Since the last email either way, or since the deal was opened">
      <ClockIcon />
      {days === 0 ? "Touched today" : `${sinceLabel(days)}`}
    </span>
  );
}

interface DealCardProps {
  row: PipelineRow;
  nowMs: number;
  busy: boolean;
  dragging: boolean;
  readOnly: boolean;
  onMove: (id: string, stage: DealStage) => void;
  onDelete: (id: string, name: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

export default function DealCard({ row, nowMs, busy, dragging, readOnly, onMove, onDelete, onDragStart, onDragEnd }: DealCardProps) {
  const { deal } = row;
  const open = deal.stage !== "won" && deal.stage !== "lost";
  const name = deal.fromLeadId ? (
    <Link href={`/admin/leads/${deal.fromLeadId}`} className="hover:underline">
      {deal.businessName}
    </Link>
  ) : (
    deal.businessName
  );

  return (
    <article
      draggable={!readOnly}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(deal.id);
      }}
      onDragEnd={onDragEnd}
      className={`group card p-4 transition-[opacity,transform,box-shadow] duration-150 hover:shadow-[inset_0_0_0_1px_var(--color-border-bright)] ${
        readOnly ? "" : "cursor-grab active:cursor-grabbing"
      } ${dragging ? "scale-[0.98] opacity-40" : ""} ${deal.stage === "lost" ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[16px] leading-snug font-semibold break-words text-[var(--color-text)]">{name}</h3>
          {row.contact && <p className="mt-0.5 truncate text-sm text-[var(--color-text-muted)]">{row.contact}</p>}
        </div>
        <p className="tabular shrink-0 text-[16px] text-[var(--color-text)]">
          {deal.value > 0 ? formatMoney(deal.value) : <span className="text-[var(--color-text-dim)]">No price</span>}
        </p>
      </div>

      <p className={`mt-3 flex gap-2 text-[15px] leading-snug ${row.nextStep ? "text-[var(--color-text)]" : "text-[var(--color-text-dim)]"}`}>
        <FlagIcon className="mt-[3px] text-[var(--color-text-dim)]" />
        <span className="line-clamp-2">{row.nextStep || "No next step"}</span>
      </p>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
        <Touch iso={row.lastTouch} nowMs={nowMs} open={open} />
        <div className="flex items-center gap-1">
          <StageMenu row={row} disabled={busy || readOnly} onMove={onMove} />
          {!readOnly && (
            <button
              type="button"
              onClick={() => onDelete(deal.id, deal.businessName)}
              className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-dim)] transition-[opacity,color] hover:text-[var(--color-hot)] focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              aria-label={`Delete ${deal.businessName}`}
            >
              <TrashIcon />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
