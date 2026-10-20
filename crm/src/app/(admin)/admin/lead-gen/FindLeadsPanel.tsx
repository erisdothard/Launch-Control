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

const chipBase =
  "t-small inline-flex min-h-[var(--control-height)] items-center justify-center rounded-[2px] border px-3 font-medium transition-colors duration-[var(--duration-fast)] disabled:cursor-not-allowed disabled:opacity-50";
const chipOff =
  "border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:border-[var(--color-border-bright)] hover:text-[var(--color-text)]";
const chipOn = "border-[var(--color-accent-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]";

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

  const stage = run.status === "queued" ? "Waiting for the search server" : (LEADGEN_STAGE_LABELS[run.stage ?? ""] ?? run.stage ?? "Working");
  const scope = [
    run.params.states?.join(", ") || "All states",
    run.params.segments?.length ? `${run.params.segments.length} segments` : "all segments",
  ].join(" · ");

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="relative mt-2 flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-accent)] opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-accent)]" />
        </span>
        <div>
          <p className="font-medium text-[var(--color-text)]" aria-live="polite">
            {stage}
          </p>
          <p className="t-small mt-0.5 text-[var(--color-text-dim)]">
            {scope} · started {minutesSince(run.startedAt)}
            {run.requestedBy ? ` by ${run.requestedBy}` : ""}
          </p>
          <p className="t-small mt-1 text-[var(--color-text-dim)]">You can leave this page. New leads show up below as they are saved.</p>
        </div>
      </div>
      <button type="button" disabled={pending} onClick={() => startTransition(() => cancelLeadsRunAction(run.id))} className="btn btn-secondary shrink-0">
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
        <legend className="label-mono mb-2 text-[var(--color-text-dim)]">
          States <span className="normal-case tracking-normal">{states.length ? `(${states.length})` : "(all)"}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {LEADGEN_STATES.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={states.includes(st)}
              disabled={pending}
              onClick={() => setStates((list) => toggle(list, st))}
              className={`${chipBase} w-12 font-mono ${states.includes(st) ? chipOn : chipOff}`}
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
        <legend className="label-mono mb-2 text-[var(--color-text-dim)]">
          Contact details <span className="normal-case tracking-normal">{require.length ? "" : "(keep all)"}</span>
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
          <legend className="label-mono mb-2 text-[var(--color-text-dim)]">Size</legend>
          <div className="flex flex-wrap gap-2">
            {LEADGEN_SIZES.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={size === s.key}
                disabled={pending}
                onClick={() => setSize(s.key)}
                className={`${chipBase} flex-col items-start py-2 text-left ${size === s.key ? chipOn : chipOff}`}
              >
                <span className="block text-base font-medium">{s.label}</span>
                <span className="t-small block font-normal opacity-80">{s.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <button type="button" onClick={submit} disabled={pending} className="btn btn-primary shrink-0">
          {pending ? "Starting..." : "Find leads"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

export default function FindLeadsPanel({ active }: { active: LeadGenRun | null }) {
  // The search form is long (states, types, size); it stays folded until someone wants a new search.
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="find-leads-heading" className="card relative mb-6 p-5 sm:p-6">
      <div aria-hidden="true" className="absolute top-[-1px] left-5 flex h-[3px] w-24 sm:left-6">
        <span className="flex-[5] bg-[var(--color-accent)]" />
        <span className="flex-[3] bg-[var(--color-livery-orange)]" />
        <span className="flex-[2] bg-[var(--color-livery-red)]" />
      </div>
      <h2 id="find-leads-heading" className="label-mono mb-4 text-[var(--color-steel)]">
        Find leads
      </h2>
      {active ? (
        <ActiveRun run={active} />
      ) : open ? (
        <>
          <StartForm />
          <button type="button" onClick={() => setOpen(false)} className="btn-quiet mt-4 -ml-4">
            Close
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base text-[var(--color-text-muted)]">Search for new motorsport businesses by state and type.</p>
          <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary shrink-0">
            Find new leads
          </button>
        </div>
      )}
    </section>
  );
}
