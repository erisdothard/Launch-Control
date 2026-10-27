"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CalendarEvent } from "@/lib/store/types";

import { useMounted } from "@/components/admin/LocalDate";
import { deleteEventAction, saveEventAction } from "./actions";
import { DEFAULT_SHOW, KIND_BAR, KIND_LABEL, KINDS, type CalendarKind } from "./kinds";

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
  today: string; // the team's calendar day, from the server
  initialShow: CalendarKind[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const kindOf = (e: CalendarEvent): CalendarKind => (e.leadId ? "meeting" : "event");

const inputClass = "field";
const labelClass = "mb-1.5 block text-sm text-[var(--color-text-dim)]";

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

/** "2:00" or "2:30" for the month grid: the hour is enough when the column is narrow. */
function shortTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/, "");
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
    <div className="space-y-4">
      <label className="block">
        <span className={labelClass}>What is it</span>
        <input autoFocus value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Call with Fever Racing" maxLength={200} className={inputClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex min-h-11 cursor-pointer items-center gap-3 text-base text-[var(--color-text-muted)]">
          <input type="checkbox" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} className="h-5 w-5 accent-[var(--color-steel)]" />
          All day
        </label>
        <label className={form.allDay ? "" : "col-span-2"}>
          <span className={labelClass}>{form.allDay ? "From" : "Date"}</span>
          <input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className={inputClass} />
        </label>
        {form.allDay ? (
          <label>
            <span className={labelClass}>To</span>
            <input type="date" value={form.endDate} min={form.date} onChange={(e) => set("endDate", e.target.value)} className={inputClass} />
          </label>
        ) : (
          <>
            <label>
              <span className={labelClass}>Start</span>
              <input type="time" value={form.start} onChange={(e) => set("start", e.target.value)} className={inputClass} />
            </label>
            <label>
              <span className={labelClass}>End</span>
              <input type="time" value={form.end} onChange={(e) => set("end", e.target.value)} className={inputClass} />
            </label>
          </>
        )}
      </div>
      <label className="block">
        <span className={labelClass}>Lead, if it is about one</span>
        <select value={form.leadId} onChange={(e) => set("leadId", e.target.value)} className={inputClass}>
          <option value="">None</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Where</span>
        <input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Address or call link" maxLength={300} className={inputClass} />
      </label>
      <label className="block">
        <span className={labelClass}>Notes</span>
        <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className={`${inputClass} resize-y`} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-[var(--color-hot)]">
          {error}
        </p>
      )}
      <div className="flex items-center gap-4 pt-1">
        <button type="button" onClick={save} disabled={pending || !form.title.trim()} className="btn btn-primary">
          {pending ? "Saving..." : form.id ? "Save" : "Add to calendar"}
        </button>
        <button type="button" onClick={() => onDone()} className="btn-quiet">
          Cancel
        </button>
        {form.id && (
          <button type="button" onClick={remove} disabled={pending} className="btn-quiet ml-auto text-sm hover:!text-[var(--color-hot)]">
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default function CalendarClient({ year, month, events: allEvents, dated: allDated, leads, presetLeadId, presetDay, outlookError, today, initialShow }: CalendarClientProps) {
  // Which kinds show. Kept in the URL (replaceState, no reload) so a filtered view survives month
  // changes and can be bookmarked.
  const [show, setShow] = useState<ReadonlySet<CalendarKind>>(() => new Set(initialShow));
  const showParam = KINDS.filter((k) => show.has(k.key)).map((k) => k.key).join(",") || "none";
  const showQuery = showParam === DEFAULT_SHOW.join(",") ? "" : `&show=${showParam}`;
  function toggleKind(kind: CalendarKind) {
    setShow((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      const param = KINDS.filter((k) => next.has(k.key)).map((k) => k.key).join(",") || "none";
      const url = new URL(window.location.href);
      if (param === DEFAULT_SHOW.join(",")) url.searchParams.delete("show");
      else url.searchParams.set("show", param);
      window.history.replaceState(null, "", url);
      return next;
    });
  }
  const events = useMemo(() => allEvents.filter((e) => show.has(kindOf(e))), [allEvents, show]);
  const dated = useMemo(() => allDated.filter((d) => show.has(d.kind)), [allDated, show]);
  const [notice, setNotice] = useState<string | null>(outlookError ? "Couldn't load the Outlook calendar just now; showing CRM events only." : null);
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

  // Days and times are the viewer's own; the grid only renders once the browser's zone is known.
  const mounted = useMounted();
  const prev = month === 1 ? monthParam(year - 1, 12) : monthParam(year, month - 1);
  const next = month === 12 ? monthParam(year + 1, 1) : monthParam(year, month + 1);
  const title = new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const day = byDay.get(selected) ?? { events: [], dated: [] };
  const selectedLabel = (() => {
    const [y, m, d] = selected.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  })();

  if (!mounted) return <div aria-busy="true" className="card min-h-[36rem]" />;

  const navClass =
    "flex h-11 min-w-11 items-center justify-center rounded-[var(--radius-sm)] px-3 text-base text-[var(--color-text-muted)] transition-colors duration-150 hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]";

  const hiddenOnDay =
    allEvents.filter((e) => !show.has(kindOf(e)) && eventDays(e).includes(selected)).length +
    allDated.filter((d) => !show.has(d.kind) && d.date === selected).length;
  // Counts are for the month on screen, whether shown or not, so a hidden kind still says what it holds.
  const monthCount = (kind: CalendarKind) =>
    kind === "meeting" || kind === "event"
      ? allEvents.filter((e) => kindOf(e) === kind && eventDays(e).some(inMonth)).length
      : allDated.filter((d) => d.kind === kind && inMonth(d.date)).length;

  return (
    <>
    <div role="group" aria-label="Show on the calendar" className="mb-5 flex flex-wrap gap-2">
      {KINDS.map((k) => {
        const on = show.has(k.key);
        return (
          <button
            key={k.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggleKind(k.key)}
            className={`flex h-11 items-center gap-2.5 rounded-full px-4 text-[15px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-steel)] ${
              on
                ? "bg-[var(--color-bg-card)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
                : "text-[var(--color-text-dim)] shadow-[inset_0_0_0_1px_var(--color-border)] hover:text-[var(--color-text)]"
            }`}
          >
            <span aria-hidden="true" className={`h-3.5 w-[3px] rounded-full ${on ? KIND_BAR[k.key] : "bg-[var(--color-text-dim)]/50"}`} />
            {k.label}
            <span className="tabular text-[var(--color-text-dim)]">{monthCount(k.key)}</span>
          </button>
        );
      })}
    </div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-8">
      <section aria-label={title} className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <h2 className="text-lg font-semibold whitespace-nowrap tracking-[-0.02em] text-[var(--color-steel)] sm:text-[22px]">{title}</h2>
          <div className="flex items-center gap-1">
            <Link href={`/admin/calendar?m=${prev}${showQuery}`} aria-label="Previous month" className={navClass}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4L6 9l5 5" />
              </svg>
            </Link>
            <Link href={`/admin/calendar${showQuery ? `?${showQuery.slice(1)}` : ""}`} className={navClass}>
              Today
            </Link>
            <Link href={`/admin/calendar?m=${next}${showQuery}`} aria-label="Next month" className={navClass}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M7 4l5 5-5 5" />
              </svg>
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-7 border-y border-[var(--color-border)]">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-2.5 text-center text-sm text-[var(--color-text-dim)]">
              <span className="sm:hidden">{w[0]}</span>
              <span className="hidden sm:inline">{w}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const items = byDay.get(cell);
            const count = (items?.events.length ?? 0) + (items?.dated.length ?? 0);
            const isSelected = cell === selected;
            const isToday = cell === today;
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
                className={`relative flex min-h-16 flex-col items-stretch gap-1.5 border-r border-b border-[var(--color-border)] p-1.5 text-left transition-colors duration-150 [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 sm:min-h-[7.5rem] sm:p-2 ${
                  isSelected ? "bg-[var(--color-bg-secondary)] shadow-[inset_0_0_0_1px_var(--color-border-bright)]" : "hover:bg-[var(--color-bg-hover)]"
                } ${inMonth(cell) ? "" : "opacity-40"}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center self-start rounded-full text-sm tabular ${
                    isToday ? "bg-[var(--color-steel)] font-semibold text-[var(--color-on-accent)]" : isSelected ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {Number(cell.slice(8))}
                </span>
                <span className="hidden flex-col gap-1 sm:flex">
                  {items?.events.slice(0, 3).map((e) => (
                    <span key={e.id} className="flex min-w-0 gap-1.5 text-sm leading-tight text-[var(--color-text)]">
                      <span aria-hidden="true" className={`w-[3px] shrink-0 self-stretch rounded-full ${KIND_BAR[kindOf(e)]}`} />
                      <span className="min-w-0">
                        {!e.allDay && <span className="block font-mono text-[13px] text-[var(--color-text-dim)]">{shortTime(e.startsAt)}</span>}
                        <span className="block truncate">{e.title}</span>
                      </span>
                    </span>
                  ))}
                  {items?.dated.slice(0, Math.max(0, 3 - items.events.length)).map((d) => (
                    <span key={d.key} className="flex min-w-0 items-center gap-1.5 text-sm leading-tight text-[var(--color-text-muted)]">
                      <span aria-hidden="true" className={`h-3.5 w-[3px] shrink-0 rounded-full ${KIND_BAR[d.kind]}`} />
                      <span className="truncate">{d.title}</span>
                    </span>
                  ))}
                  {count > 3 && <span className="pl-[9px] text-sm text-[var(--color-text-dim)]">{count - 3} more</span>}
                </span>
                {count > 0 && (
                  <span className="flex gap-1 pl-1 sm:hidden" aria-hidden="true">
                    {items?.events.some((e) => kindOf(e) === "meeting") ? <span className={`h-1.5 w-1.5 rounded-full ${KIND_BAR.meeting}`} /> : null}
                    {items?.events.some((e) => kindOf(e) === "event") ? <span className={`h-1.5 w-1.5 rounded-full ${KIND_BAR.event}`} /> : null}
                    {items?.dated.some((d) => d.kind === "followup") ? <span className={`h-1.5 w-1.5 rounded-full ${KIND_BAR.followup}`} /> : null}
                    {items?.dated.some((d) => d.kind === "task") ? <span className={`h-1.5 w-1.5 rounded-full ${KIND_BAR.task}`} /> : null}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <aside aria-labelledby="day-heading" className="xl:pt-1">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="day-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
            {selected === today ? `Today, ${selectedLabel.split(", ").slice(1).join(", ")}` : selectedLabel}
          </h2>
          {!draft && (
            <button type="button" onClick={() => setDraft(newDraft(selected, null))} className="btn btn-primary btn-sm">
              Add event
            </button>
          )}
        </div>

        {notice && (
          <p role="status" className="well mb-4 px-4 py-3 text-sm text-[var(--color-warm)]">
            {notice}
          </p>
        )}
        {draft ? (
          <div className="card p-5">
            <p className="mb-4 text-base font-semibold text-[var(--color-text)]">{draft.id ? "Edit event" : "New event"}</p>
            <EventForm
              key={draft.id ?? `new-${draft.date}`}
              draft={draft}
              leads={leads}
              onDone={(warning) => {
                setDraft(null);
                setNotice(warning ?? null);
              }}
            />
          </div>
        ) : day.events.length + day.dated.length === 0 ? (
          <p className="border-t border-[var(--color-border)] py-5 text-base text-[var(--color-text-muted)]">Nothing on this day.</p>
        ) : (
          <ul className="border-t border-[var(--color-border)]">
            {day.events.map((e) => {
              const when = e.allDay ? "All day" : timeLabel(e.startsAt);
              const inner = (
                <>
                  <span aria-hidden="true" className={`w-[3px] self-stretch rounded-full ${KIND_BAR[kindOf(e)]}`} />
                  <span className={`pt-px text-sm text-[var(--color-text-dim)] tabular ${e.allDay ? "" : "font-mono"}`}>{when}</span>
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-[var(--color-text)] group-hover:text-white">{e.title}</span>
                    <span className="mt-0.5 block text-sm text-[var(--color-text-muted)]">
                      {e.allDay ? (kindOf(e) === "meeting" ? "Meeting" : "Event") : `Until ${timeLabel(e.endsAt)}`}
                      {e.leadId && leadName.get(e.leadId) ? ` · ${leadName.get(e.leadId)}` : ""}
                    </span>
                    {e.location && <span className="mt-0.5 block truncate text-sm text-[var(--color-text-dim)]">{e.location}</span>}
                    <span className="mt-0.5 block text-sm text-[var(--color-text-dim)]">
                      {e.outlookLink ? "From Outlook, opens there to edit" : `Added by ${e.createdBy}`}
                    </span>
                  </span>
                </>
              );
              const rowClass =
                "group grid w-full grid-cols-[3px_4.75rem_minmax(0,1fr)] gap-x-3 border-b border-[var(--color-border)] py-3.5 text-left transition-colors duration-150 hover:bg-[var(--color-bg-hover)]";
              return (
                <li key={e.id}>
                  {e.outlookLink ? (
                    <a href={e.outlookLink} target="_blank" rel="noopener noreferrer" className={rowClass}>
                      {inner}
                    </a>
                  ) : (
                    <button type="button" onClick={() => setDraft(draftFromEvent(e))} className={rowClass}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
            {day.dated.map((d) => (
              <li key={d.key}>
                <Link
                  href={d.href}
                  className="group grid grid-cols-[3px_4.75rem_minmax(0,1fr)] gap-x-3 border-b border-[var(--color-border)] py-3.5 transition-colors duration-150 hover:bg-[var(--color-bg-hover)]"
                >
                  <span aria-hidden="true" className={`w-[3px] self-stretch rounded-full ${KIND_BAR[d.kind]}`} />
                  <span className="pt-px text-sm text-[var(--color-text-dim)]">{KIND_LABEL[d.kind]}</span>
                  <span className="min-w-0">
                    <span className="block text-base font-medium text-[var(--color-text)] group-hover:text-white">{d.title}</span>
                    <span className="mt-0.5 block text-sm text-[var(--color-text-muted)]">{d.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {hiddenOnDay > 0 && !draft && (
          <p className="mt-4 text-[15px] text-[var(--color-text-dim)]">
            {hiddenOnDay === 1 ? "One more item on this day is" : `${hiddenOnDay} more items on this day are`} hidden. Turn{" "}
            {KINDS.filter((k) => !show.has(k.key)).map((k) => k.label.toLowerCase()).join(" or ")} on above the calendar to see{" "}
            {hiddenOnDay === 1 ? "it" : "them"}.
          </p>
        )}
      </aside>
    </div>
    </>
  );
}
