"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadGenRun } from "@/lib/store/types";
import {
  LEADGEN_REQUIRE,
  LEADGEN_SEGMENTS,
  LEADGEN_SIZES,
  LEADGEN_STAGE_LABELS,
  LEADGEN_STATES,
  type LeadGenSizeKey,
} from "@/lib/leadgen/catalog";
import { cancelLeadsRunAction, findLeadsAction } from "./actions";

// While a search is queued or running, re-read the page this often so stage and new leads appear.
const POLL_MS = 8000;

// Chosen options read as filled steel, not yellow: yellow is kept for the one button that starts the search.
const chipBase =
  "min-h-10 rounded-[var(--radius-sm)] px-3.5 py-2 text-sm transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50";
const chipOff =
  "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] hover:shadow-[inset_0_0_0_1px_var(--color-border-bright)]";
const chipOn = "bg-[var(--color-steel)] font-medium text-[var(--color-on-accent)]";
const legendClass = "mb-2.5 text-sm text-[var(--color-text-dim)]";

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
          <p className="text-base font-medium text-[var(--color-text)]" aria-live="polite">
            {stage}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {scope} · started {minutesSince(run.startedAt)}
            {run.requestedBy ? ` by ${run.requestedBy}` : ""}
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            You can leave this page. New leads show up below as they are saved.
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => cancelLeadsRunAction(run.id))}
        className="btn btn-secondary btn-sm shrink-0 hover:!text-[var(--color-hot)]"
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
  const [require, setRequire] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await findLeadsAction({ states, segments, size, require });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <fieldset>
        <legend className={legendClass}>
          States <span className="text-[var(--color-text-dim)]">{states.length ? `(${states.length})` : "(all)"}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {LEADGEN_STATES.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={states.includes(st)}
              disabled={pending}
              onClick={() => setStates((list) => toggle(list, st))}
              className={`${chipBase} w-14 tabular ${states.includes(st) ? chipOn : chipOff}`}
            >
              {st}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={legendClass}>
          Business types <span className="text-[var(--color-text-dim)]">{segments.length ? `(${segments.length})` : "(all)"}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
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

      <fieldset>
        <legend className={legendClass}>
          Contact details <span className="text-[var(--color-text-dim)]">{require.length ? "" : "(keep all)"}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {LEADGEN_REQUIRE.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={require.includes(r.key)}
              disabled={pending}
              onClick={() => setRequire((list) => toggle(list, r.key))}
              className={`${chipBase} ${require.includes(r.key) ? chipOn : chipOff}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <fieldset>
          <legend className={legendClass}>Size</legend>
          <div className="flex flex-wrap gap-2">
            {LEADGEN_SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={size === s.key}
                disabled={pending}
                onClick={() => setSize(s.key)}
                className={`${chipBase} text-left ${size === s.key ? chipOn : chipOff}`}
              >
                <span className="block text-[15px] font-medium">{s.label}</span>
                <span className="mt-0.5 block text-sm opacity-80">{s.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="btn btn-primary shrink-0"
        >
          {pending ? "Starting..." : "Find leads"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-hot)]">
          {error}
        </p>
      )}
    </div>
  );
}

// Collapsed by default once there are prospects, so the list stays the main thing on the page.
export default function FindLeadsPanel({ active, startOpen }: { active: LeadGenRun | null; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  return (
    <section aria-labelledby="find-leads-heading" className="card relative mb-8 overflow-hidden">
      <div aria-hidden="true" className="absolute top-0 bottom-0 left-0 flex w-[5px] flex-col">
        <span className="flex-[5] bg-[var(--color-accent)]" />
        <span className="flex-[3] bg-[var(--color-livery-orange)]" />
        <span className="flex-[2] bg-[var(--color-livery-red)]" />
      </div>
      <div className="px-5 py-5 sm:pr-7 sm:pl-8">
        {active ? (
          <>
            <h2 id="find-leads-heading" className="mb-3 text-[17px] font-semibold text-[var(--color-text)]">
              Searching for leads
            </h2>
            <ActiveRun run={active} />
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 id="find-leads-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
                  Find more leads
                </h2>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  Pick where to look and what kind of business. The search runs on its own and new leads land in the list below.
                </p>
              </div>
              <button type="button" aria-expanded={open} aria-controls="find-leads-form" onClick={() => setOpen((v) => !v)} className={`btn shrink-0 ${open ? "btn-secondary" : "btn-primary"}`}>
                {open ? "Close" : "New search"}
              </button>
            </div>
            {open && (
              <div id="find-leads-form" className="mt-6 border-t border-[var(--color-border)] pt-6">
                <StartForm />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
