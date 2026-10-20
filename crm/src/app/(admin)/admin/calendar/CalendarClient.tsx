"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalendarEvent } from "@/lib/store/types";
import { todayISO } from "@/lib/leads/followUp";
import { deleteEventAction, saveEventAction } from "./actions";

export interface CalendarLead {
  id: string;
  name: string;
}

// Follow-ups and tasks: date-only items shown alongside meetings.
export interface DatedItem {
  key: string;
  kind: "followup" | "task";
  date: string; // YYYY-MM-DD
  title: string;
  detail: string;
  href: string;
}

interface CalendarClientProps {
  year: number;
  month: number; // 1-12
  events: CalendarEvent[];
  dated: DatedItem[];
  leads: CalendarLead[];
  presetLeadId: string | null;
  presetDay: string | null;
  outlookError: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KIND_STYLE = {
  event: "border-l-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-text)]",
  followup: "border-l-[var(--color-livery-orange)] bg-[var(--color-livery-orange)]/10 text-[var(--color-text)]",
  task: "border-l-[var(--color-steel)] bg-white/[0.05] text-[var(--color-text-muted)]",
} as const;
const KIND_LABEL = { followup: "Follow-up", task: "Task" } as const;

const inputClass =
  "w-full rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text)] placeholder-[var(--color-text-dim)] outline-none focus:border-[var(--color-accent)]/50";

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthParam = (y: number, m: number) => `${y}-${pad(m)}`;

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Local days an event covers (an all-day event stored as local midnight to local midnight). */
function eventDays(e: CalendarEvent): string[] {
  const first = isoDay(new Date(e.startsAt));
  const endMs = new Date(e.endsAt).getTime() - (e.allDay ? 1 : 0);
  const last = isoDay(new Date(Math.max(endMs, new Date(e.startsAt).getTime())));
  const days = [first];
  while (days[days.length - 1] < last && days.length < 15) days.push(addDays(days[days.length - 1], 1));
  return days;
}

interface Draft {
  id: string | null;
  title: string;
  date: string;
  endDate: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  notes: string;
  leadId: string;
}

function newDraft(day: string, leadId: string | null): Draft {
  return { id: null, title: "", date: day, endDate: day, start: "10:00", end: "10:30", allDay: false, location: "", notes: "", leadId: leadId ?? "" };
}

function draftFromEvent(e: CalendarEvent): Draft {
  const s = new Date(e.startsAt);
  const en = new Date(e.allDay ? new Date(e.endsAt).getTime() - 1 : e.endsAt);
  return {
    id: e.id,
    title: e.title,
    date: isoDay(s),
    endDate: isoDay(en),
    start: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
    end: `${pad(en.getHours())}:${pad(en.getMinutes())}`,
    allDay: e.allDay,
    location: e.location,
    notes: e.notes,
    leadId: e.leadId ?? "",
  };
}

// Local wall-clock → ISO. All-day runs midnight to the midnight after the last day.
function draftTimes(d: Draft): { startsAt: string; endsAt: string } {
  const at = (day: string, time: string) => {
    const [y, m, dd] = day.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, dd, hh, mm).toISOString();
  };
  if (d.allDay) return { startsAt: at(d.date, "00:00"), endsAt: at(addDays(d.endDate < d.date ? d.date : d.endDate, 1), "00:00") };
  return { startsAt: at(d.date, d.start), endsAt: at(d.date, d.end) };
}

function EventForm({ draft, leads, onDone }: { draft: Draft; leads: CalendarLead[]; onDone: (warning?: string | null) => void }) {
  const router = useRouter();
  const [form, setForm] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await saveEventAction(form.id, {
        title: form.title,
        ...draftTimes(form),
        allDay: form.allDay,
        location: form.location,
        notes: form.notes,
        leadId: form.leadId || null,
      });
      if (!res.ok) return setError(res.error);
      onDone(res.warning);
      router.refresh();
    });
  }

  function remove() {
    if (!form.id) return;
    startTransition(async () => {
      const res = await deleteEventAction(form.id!, form.leadId || null);
      if (!res.ok) return setError(res.error);
      onDone(res.warning);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Call with Fever Racing" maxLength={200} className={inputClass} aria-label="Title" />
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
          <input type="checkbox" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} className="accent-[var(--color-accent)]" />
          All day
        </label>
        <label className={form.allDay ? "" : "col-span-2"}>
          <span className="mb-1 block text-xs text-[var(--color-text-muted)]">{form.allDay ? "From" : "Date"}</span>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass} />
        </label>
        {form.allDay ? (
          <label>
            <span className="mb-1 block text-xs text-[var(--color-text-muted)]">To</span>
            <input type="date" value={form.endDate} min={form.date} onChange={(e) => set("endDate", e.target.value)} className={inputClass} />
          </label>
        ) : (
          <>
            <label>
              <span className="mb-1 block text-xs text-[var(--color-text-muted)]">Start</span>
              <input type="time" value={form.start} onChange={(e) => set("start", e.target.value)} className={inputClass} />
            </label>
            <label>
              <span className="mb-1 block text-xs text-[var(--color-text-muted)]">End</span>
              <input type="time" value={form.end} onChange={(e) => set("end", e.target.value)} className={inputClass} />
            </label>
          </>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-xs text-[var(--color-text-muted)]">Lead (optional)</span>
        <select value={form.leadId} onChange={(e) => set("leadId", e.target.value)} className={inputClass}>
          <option value="">None</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Location or call link" maxLength={300} className={inputClass} aria-label="Location" />
      <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes" rows={3} className={inputClass} aria-label="Notes" />
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !form.title.trim()}
          className="rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button type="button" onClick={() => onDone()} className="px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
          Cancel
        </button>
        {form.id && (
          <button type="button" onClick={remove} disabled={pending} className="ml-auto px-2 py-2 text-xs text-[var(--color-text-dim)] hover:text-[var(--color-livery-red)]">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function CalendarClient({ year, month, events, dated, leads, presetLeadId, presetDay, outlookError }: CalendarClientProps) {
  const [notice, setNotice] = useState<string | null>(outlookError ? "Couldn't load the Outlook calendar just now; showing CRM events only." : null);
  const today = todayISO();
  const inMonth = (day: string) => day.startsWith(monthParam(year, month));
  const [selected, setSelected] = useState(presetDay && inMonth(presetDay) ? presetDay : inMonth(today) ? today : `${monthParam(year, month)}-01`);
  const [draft, setDraft] = useState<Draft | null>(presetLeadId ? newDraft(selected, presetLeadId) : null);
  const leadName = useMemo(() => new Map(leads.map((l) => [l.id, l.name])), [leads]);

  // 6 weeks from the Sunday on or before the 1st.
  const cells = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const start = isoDay(new Date(year, month - 1, 1 - first.getDay()));
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, { events: CalendarEvent[]; dated: DatedItem[] }>();
    const slot = (day: string) => {
      if (!map.has(day)) map.set(day, { events: [], dated: [] });
      return map.get(day)!;
    };
    for (const e of events) for (const day of eventDays(e)) slot(day).events.push(e);
    for (const item of dated) slot(item.date).dated.push(item);
    return map;
  }, [events, dated]);

  const prev = month === 1 ? monthParam(year - 1, 12) : monthParam(year, month - 1);
  const next = month === 12 ? monthParam(year + 1, 1) : monthParam(year, month + 1);
  const title = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const day = byDay.get(selected) ?? { events: [], dated: [] };
  const selectedLabel = (() => {
    const [y, m, d] = selected.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  })();

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_22rem]">
      <section aria-label={title} className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
          <h2 className="font-display text-sm uppercase tracking-[var(--tracking-signage)] text-[var(--color-steel)]">{title}</h2>
          <div className="flex items-center gap-1">
            <Link href={`/admin/calendar?m=${prev}`} aria-label="Previous month" className="rounded-[2px] px-2.5 py-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]">
              ←
            </Link>
            <Link href="/admin/calendar" className="rounded-[2px] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]">
              Today
            </Link>
            <Link href={`/admin/calendar?m=${next}`} aria-label="Next month" className="rounded-[2px] px-2.5 py-1.5 text-[var(--color-text-muted)] hover:bg-white/[0.05] hover:text-[var(--color-text)]">
              →
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="label-mono px-2 py-2 text-center text-[var(--color-text-dim)]">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const items = byDay.get(cell);
            const count = (items?.events.length ?? 0) + (items?.dated.length ?? 0);
            const isSelected = cell === selected;
            return (
              <button
                key={cell}
                type="button"
                onClick={() => {
                  setSelected(cell);
                  setDraft(null);
                }}
                aria-pressed={isSelected}
                aria-label={`${cell}${count ? `, ${count} items` : ""}`}
                className={`relative flex min-h-16 flex-col items-stretch gap-1 border-r border-b border-[var(--color-border)] p-1.5 text-left transition-colors [&:nth-child(7n)]:border-r-0 sm:min-h-28 ${
                  isSelected ? "bg-[var(--color-accent)]/[0.07]" : "hover:bg-white/[0.03]"
                } ${inMonth(cell) ? "" : "opacity-40"}`}
              >
                <span
                  className={`self-start rounded-[2px] px-1.5 font-mono text-xs tabular-nums ${
                    cell === today ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]" : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {Number(cell.slice(8))}
                </span>
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {items?.events.slice(0, 3).map((e) => (
                    <span key={e.id} className={`truncate border-l-2 px-1 text-[11px] ${KIND_STYLE.event}`}>
                      {!e.allDay && <span className="text-[var(--color-text-dim)]">{timeLabel(e.startsAt)} </span>}
                      {e.title}
                    </span>
                  ))}
                  {items?.dated.slice(0, Math.max(0, 3 - items.events.length)).map((d) => (
                    <span key={d.key} className={`truncate border-l-2 px-1 text-[11px] ${KIND_STYLE[d.kind]}`}>
                      {d.title}
                    </span>
                  ))}
                  {count > 3 && <span className="px-1 text-[10px] text-[var(--color-text-dim)]">+{count - 3} more</span>}
                </span>
                {count > 0 && (
                  <span className="flex gap-0.5 sm:hidden" aria-hidden="true">
                    {items?.events.length ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" /> : null}
                    {items?.dated.some((d) => d.kind === "followup") ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-livery-orange)]" /> : null}
                    {items?.dated.some((d) => d.kind === "task") ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-steel)]" /> : null}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <aside aria-labelledby="day-heading" className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="day-heading" className="text-sm font-semibold text-[var(--color-text)]">
            {selectedLabel}
          </h2>
          {!draft && (
            <button
              type="button"
              onClick={() => setDraft(newDraft(selected, null))}
              className="rounded-[2px] bg-[var(--color-accent)] px-3 py-1.5 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]"
            >
              + Event
            </button>
          )}
        </div>

        {notice && (
          <p role="status" className="mb-4 rounded-[2px] border border-[var(--color-livery-orange)]/40 bg-[var(--color-livery-orange)]/10 px-3 py-2 text-xs text-[var(--color-text)]">
            {notice}
          </p>
        )}
        {draft ? (
          <EventForm
            key={draft.id ?? `new-${draft.date}`}
            draft={draft}
            leads={leads}
            onDone={(warning) => {
              setDraft(null);
              setNotice(warning ?? null);
            }}
          />
        ) : day.events.length + day.dated.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">Nothing on this day.</p>
        ) : (
          <ul className="space-y-2">
            {day.events.map((e) => (
              <li key={e.id}>
                {e.outlookLink ? (
                  <a href={e.outlookLink} target="_blank" rel="noopener noreferrer" className={`block border-l-2 px-3 py-2 hover:brightness-125 ${KIND_STYLE.event}`}>
                    <p className="text-sm font-medium">{e.title}</p>
                    <p className="text-xs text-[var(--color-text-muted)]">{e.allDay ? "All day" : `${timeLabel(e.startsAt)} – ${timeLabel(e.endsAt)}`}</p>
                    {e.location && <p className="truncate text-xs text-[var(--color-text-dim)]">{e.location}</p>}
                    <p className="text-[11px] text-[var(--color-text-dim)]">From Outlook · open to edit</p>
                  </a>
                ) : (
                <button type="button" onClick={() => setDraft(draftFromEvent(e))} className={`w-full border-l-2 px-3 py-2 text-left hover:brightness-125 ${KIND_STYLE.event}`}>
                  <p className="text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {e.allDay ? "All day" : `${timeLabel(e.startsAt)} – ${timeLabel(e.endsAt)}`}
                    {e.leadId && leadName.get(e.leadId) ? ` · ${leadName.get(e.leadId)}` : ""}
                  </p>
                  {e.location && <p className="truncate text-xs text-[var(--color-text-dim)]">{e.location}</p>}
                  <p className="text-[11px] text-[var(--color-text-dim)]">Added by {e.createdBy}</p>
                </button>
                )}
              </li>
            ))}
            {day.dated.map((d) => (
              <li key={d.key}>
                <Link href={d.href} className={`block border-l-2 px-3 py-2 hover:brightness-125 ${KIND_STYLE[d.kind]}`}>
                  <p className="text-sm font-medium">{d.title}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {KIND_LABEL[d.kind]} · {d.detail}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--color-border)] pt-4 text-[11px] text-[var(--color-text-dim)]">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-[var(--color-accent)]" /> Meeting
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-[var(--color-livery-orange)]" /> Follow-up
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 bg-[var(--color-steel)]" /> Task
          </span>
        </div>
      </aside>
    </div>
  );
}
