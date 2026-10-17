"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadGenRun } from "@/lib/store/types";
import {
  LEADGEN_SEGMENTS,
  LEADGEN_SIZES,
  LEADGEN_STAGE_LABELS,
  LEADGEN_STATES,
  type LeadGenSizeKey,
} from "@/lib/leadgen/catalog";
import { cancelLeadsRunAction, findLeadsAction } from "./actions";

// While a search is queued or running, re-read the page this often so stage and new leads appear.
const POLL_MS = 8000;

const chipBase =
  "rounded-[2px] border px-2.5 py-1.5 text-xs transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50";
const chipOff =
  "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)]";
const chipOn = "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]";

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function minutesSince(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min ago`;
}

function ActiveRun({ run }: { run: LeadGenRun }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const id = window.setInterval(() => router.refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [router]);

  const stage =
    run.status === "queued"
      ? "Waiting for the search server"
      : (LEADGEN_STAGE_LABELS[run.stage ?? ""] ?? run.stage ?? "Working");
  const scope = [
    run.params.states?.join(", ") || "All states",
    run.params.segments?.length ? `${run.params.segments.length} segments` : "all segments",
  ].join(" · ");

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="relative mt-1.5 flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
        </span>
        <div>
          <p className="font-medium text-[var(--color-text)]" aria-live="polite">
            {stage}
          </p>
          <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">
            {scope} · started {minutesSince(run.startedAt)}
            {run.requestedBy ? ` by ${run.requestedBy}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-dim)]">
            You can leave this page. New leads show up below as they are saved.
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => cancelLeadsRunAction(run.id))}
        className="shrink-0 rounded-[2px] border border-[var(--color-border-bright)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-livery-red)] hover:text-[var(--color-livery-red)] disabled:opacity-50"
      >
        {pending ? "Cancelling..." : "Cancel search"}
      </button>
    </div>
  );
}

function StartForm() {
  const [states, setStates] = useState<string[]>([]);
  const [segments, setSegments] = useState<string[]>([]);
  const [size, setSize] = useState<LeadGenSizeKey>("quick");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await findLeadsAction({ states, segments, size });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className="label-mono mb-2 text-[var(--color-text-dim)]">
          States <span className="normal-case tracking-normal">{states.length ? `(${states.length})` : "(all)"}</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {LEADGEN_STATES.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={states.includes(st)}
              disabled={pending}
              onClick={() => setStates((list) => toggle(list, st))}
              className={`${chipBase} w-11 font-mono ${states.includes(st) ? chipOn : chipOff}`}
            >
              {st}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="label-mono mb-2 text-[var(--color-text-dim)]">
          Business types <span className="normal-case tracking-normal">{segments.length ? `(${segments.length})` : "(all)"}</span>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {LEADGEN_SEGMENTS.map((seg) => (
            <button
              key={seg.key}
              type="button"
              aria-pressed={segments.includes(seg.key)}
              disabled={pending}
              onClick={() => setSegments((list) => toggle(list, seg.key))}
              className={`${chipBase} ${segments.includes(seg.key) ? chipOn : chipOff}`}
            >
              {seg.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <fieldset>
          <legend className="label-mono mb-2 text-[var(--color-text-dim)]">Size</legend>
          <div className="flex flex-wrap gap-1.5">
            {LEADGEN_SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={size === s.key}
                disabled={pending}
                onClick={() => setSize(s.key)}
                className={`${chipBase} text-left ${size === s.key ? chipOn : chipOff}`}
              >
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-[11px] opacity-80">{s.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-[2px] bg-[var(--color-accent)] px-6 font-display text-[12px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Starting..." : "Find leads"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export default function FindLeadsPanel({ active }: { active: LeadGenRun | null }) {
  return (
    <section
      aria-labelledby="find-leads-heading"
      className="relative mb-6 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 sm:p-6"
    >
      <div aria-hidden="true" className="absolute top-[-1px] left-5 flex h-[3px] w-24 sm:left-6">
        <span className="flex-[5] bg-[var(--color-accent)]" />
        <span className="flex-[3] bg-[var(--color-livery-orange)]" />
        <span className="flex-[2] bg-[var(--color-livery-red)]" />
      </div>
      <h2 id="find-leads-heading" className="label-mono mb-4 text-[var(--color-steel)]">
        Find leads
      </h2>
      {active ? <ActiveRun run={active} /> : <StartForm />}
    </section>
  );
}
