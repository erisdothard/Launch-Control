"use client";

import { useMemo, useRef, useState } from "react";
import { parseRecipientList } from "@/lib/email/merge";
import { LEAD_STATUSES, LEAD_VIEWS } from "@/lib/store/types";
import { EXCLUDE_LABELS, leadCandidate, recipientName, type AudienceLead, type Candidate, type ExcludeReason, type Recipient } from "./audience";
import { Avatar } from "./ui";

type Source = "view" | "status" | "source" | "find" | "paste";

const SOURCES: { key: Source; label: string }[] = [
  { key: "view", label: "Saved view" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "find", label: "Find a lead" },
  { key: "paste", label: "Paste a list" },
];

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting set",
  proposal: "Proposal out",
  negotiation: "Negotiating",
  converted: "Customers",
  lost: "Closed",
};

const SKIP_OPTIONS = [0, 3, 7, 14, 30, 60, 90];
const LIST_PAGE = 40;

interface RecipientsStepProps {
  leads: AudienceLead[];
  candidates: Candidate[];
  included: Recipient[];
  excluded: Recipient[];
  skipDays: number;
  onSkipDays: (days: number) => void;
  onAdd: (add: Candidate[]) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onOverride: (key: string, include: boolean) => void;
  note: string;
}

function SourceRow({ label, sub, n, onAdd, added }: { label: string; sub?: string; n: number; onAdd: () => void; added: number }) {
  return (
    <li className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-[15.5px] text-[var(--color-text)]">{label}</div>
        <div className="text-[14px] text-[var(--color-text-dim)]">
          {n === 0 ? "Nobody here" : `${n} ${n === 1 ? "person" : "people"} with an email${sub ? ` · ${sub}` : ""}`}
        </div>
      </div>
      {added > 0 && added >= n ? (
        <span className="text-[14px] text-[var(--color-success)]">On the list</span>
      ) : (
        <button type="button" disabled={n === 0} onClick={onAdd} className="btn btn-secondary btn-sm">
          Add {n > 0 ? n : ""}
        </button>
      )}
    </li>
  );
}

// Step 1: who gets it. Add from views, statuses, sources, one by one, or a pasted/uploaded list;
// the list on the right dedupes and sets aside anyone who shouldn't get it, saying why.
export default function RecipientsStep(props: RecipientsStepProps) {
  const { leads, candidates, included, excluded, skipDays, onSkipDays, onAdd, onRemove, onClear, onOverride, note } = props;
  const [source, setSource] = useState<Source>("view");
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<{ text: string; rejected: string[] } | null>(null);
  const [shown, setShown] = useState(LIST_PAGE);
  const [openReason, setOpenReason] = useState<ExcludeReason | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const withEmail = useMemo(() => leads.filter((l) => l.email.trim()), [leads]);
  const onList = useMemo(() => new Set(candidates.map((c) => c.leadId).filter(Boolean)), [candidates]);
  const addedOf = (group: AudienceLead[]) => group.filter((l) => onList.has(l.id)).length;
  const addGroup = (group: AudienceLead[], origin: string) => onAdd(group.filter((l) => !onList.has(l.id)).map((l) => leadCandidate(l, origin)));

  const sources = useMemo(() => {
    const m = new Map<string, AudienceLead[]>();
    for (const l of withEmail) m.set(l.source || "No source", [...(m.get(l.source || "No source") ?? []), l]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [withEmail]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return leads
      .filter((l) => [l.contactName, l.businessName, l.email].some((v) => v.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [leads, query]);

  function addPasted(text: string, origin: string) {
    const parsed = parseRecipientList(text);
    onAdd(parsed.contacts.map((c) => ({ email: c.email, leadId: null, values: c.values, origin })));
    const cols = parsed.columns.filter((c) => c !== "email");
    setPasteNote({
      text:
        parsed.contacts.length === 0
          ? "No email addresses found in that."
          : `Added ${parsed.contacts.length} ${parsed.contacts.length === 1 ? "address" : "addresses"}${cols.length ? `, with ${cols.join(", ").replace(/_/g, " ")}` : ""}.`,
      rejected: parsed.rejected,
    });
    setPaste("");
  }

  const groups = (Object.keys(EXCLUDE_LABELS) as ExcludeReason[])
    .map((reason) => ({ reason, rows: excluded.filter((r) => r.excluded === reason) }))
    .filter((g) => g.rows.length > 0);

  const tab = (s: (typeof SOURCES)[number]) => (
    <button
      key={s.key}
      type="button"
      role="tab"
      aria-selected={source === s.key}
      onClick={() => setSource(s.key)}
      className={`shrink-0 rounded-full px-3.5 py-2 text-[14.5px] transition-colors ${
        source === s.key
          ? "bg-[var(--color-steel)]/[0.14] font-medium text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-steel)]"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      {s.label}
    </button>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Add people */}
      <section aria-labelledby="add-people" className="card self-start p-4 sm:p-6">
        <h2 id="add-people" className="text-[17px] font-semibold text-[var(--color-text)]">
          Add people
        </h2>
        <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">Mix and match. Anyone added twice gets one email.</p>
        <div role="tablist" aria-label="Where to add people from" className="mt-4 flex flex-wrap gap-1.5">
          {SOURCES.map(tab)}
        </div>

        <div className="mt-3">
          {source === "view" && (
            <ul>
              {LEAD_VIEWS.map((v) => {
                const group = v.key === "all" ? withEmail : withEmail.filter((l) => l.views.includes(v.key));
                return <SourceRow key={v.key} label={v.label} sub={v.hint} n={group.length} added={addedOf(group)} onAdd={() => addGroup(group, `${v.label} view`)} />;
              })}
            </ul>
          )}
          {source === "status" && (
            <ul>
              {LEAD_STATUSES.map((s) => {
                const group = withEmail.filter((l) => l.status === s);
                return <SourceRow key={s} label={STATUS_LABEL[s] ?? s} n={group.length} added={addedOf(group)} onAdd={() => addGroup(group, `Status: ${STATUS_LABEL[s] ?? s}`)} />;
              })}
            </ul>
          )}
          {source === "source" && (
            <ul>
              {sources.length === 0 && <li className="py-3 text-[15px] text-[var(--color-text-dim)]">No leads with an email yet.</li>}
              {sources.map(([name, group]) => (
                <SourceRow key={name} label={name === "lead-gen" ? "Lead Gen" : name} n={group.length} added={addedOf(group)} onAdd={() => addGroup(group, `Source: ${name}`)} />
              ))}
            </ul>
          )}
          {source === "find" && (
            <div>
              <label htmlFor="find-lead" className="sr-only">
                Find a lead
              </label>
              <input id="find-lead" className="field" placeholder="Name, company or email" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
              <ul className="mt-2">
                {query.trim() && matches.length === 0 && <li className="py-3 text-[15px] text-[var(--color-text-dim)]">No lead matches that.</li>}
                {matches.map((l) => {
                  const name = l.contactName || l.businessName;
                  const added = onList.has(l.id);
                  return (
                    <li key={l.id} className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 last:border-0">
                      <Avatar name={name} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15.5px] text-[var(--color-text)]">
                          {name}
                          {l.contactName && <span className="text-[var(--color-text-dim)]"> · {l.businessName}</span>}
                        </div>
                        <div className="truncate text-[14px] text-[var(--color-text-dim)]">{l.email || "No email"}</div>
                      </div>
                      {added ? (
                        <span className="text-[14px] text-[var(--color-success)]">Added</span>
                      ) : (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAdd([leadCandidate(l, "Added by hand")])}>
                          Add
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {source === "paste" && (
            <div>
              <label htmlFor="paste-list" className="mb-1.5 block text-[15px] text-[var(--color-text-muted)]">
                Paste addresses or a spreadsheet. Columns named name, email and company are picked up on their own.
              </label>
              <textarea
                id="paste-list"
                className="field min-h-[150px] font-mono text-[14px] leading-relaxed"
                placeholder={"dana@ridgemotorsport.com, kevin@apextrackdays.com\n\nor\n\nname,email,company\nDana Reyes,dana@ridgemotorsport.com,Ridge Motorsport"}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-secondary btn-sm" disabled={!paste.trim()} onClick={() => addPasted(paste, "Pasted list")}>
                  Add these
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => file.current?.click()}>
                  Upload a CSV file
                </button>
                <input
                  ref={file}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    if (f.size > 2 * 1024 * 1024) {
                      setPasteNote({ text: "That file is over 2 MB. Split it into smaller files.", rejected: [] });
                      return;
                    }
                    addPasted(await f.text(), f.name);
                  }}
                />
              </div>
              {pasteNote && (
                <div className="mt-3 text-[15px] text-[var(--color-text-muted)]" role="status">
                  {pasteNote.text}
                  {pasteNote.rejected.length > 0 && (
                    <details className="mt-1 text-[14px] text-[var(--color-text-dim)]">
                      <summary className="cursor-pointer">
                        {pasteNote.rejected.length} {pasteNote.rejected.length === 1 ? "line had" : "lines had"} no email address
                      </summary>
                      <ul className="mt-1 space-y-0.5 font-mono text-[13px]">
                        {pasteNote.rejected.slice(0, 20).map((line, i) => (
                          <li key={i} className="truncate">{line}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* The list */}
      <div className="space-y-6">
        <section aria-labelledby="the-list" className="card overflow-hidden">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 pt-5 sm:px-6">
            <h2 id="the-list" className="text-[17px] font-semibold text-[var(--color-text)]">
              {included.length === 0 ? "Nobody on the list yet" : `${included.length} ${included.length === 1 ? "person gets" : "people get"} this`}
            </h2>
            {candidates.length > 0 && (
              <button type="button" className="btn-quiet text-[14.5px]" onClick={onClear}>
                Start over
              </button>
            )}
          </div>
          {note && <p className="px-4 pt-1 text-[15px] text-[var(--color-text-muted)] sm:px-6">{note}</p>}
          <p className="px-4 pt-1 text-[15px] text-[var(--color-text-dim)] sm:px-6">Each person gets their own email. Nobody sees who else got it.</p>

          <ul className="mt-3">
            {included.slice(0, shown).map((r) => {
              const name = recipientName(r);
              return (
                <li key={r.key} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-x-3 border-t border-[var(--color-border)] px-4 py-3 sm:px-6">
                  <Avatar name={name} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-[15.5px] text-[var(--color-text)]">
                      {name}
                      {r.values.full_name && r.values.company && <span className="text-[var(--color-text-dim)]"> · {r.values.company}</span>}
                    </div>
                    <div className="truncate text-[14px] text-[var(--color-text-dim)]">
                      {r.email}
                      {r.overridden ? <span className="text-[var(--color-warm)]"> · {r.detail}, included anyway</span> : <span> · {r.origin}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (r.overridden ? onOverride(r.key, false) : onRemove(r.key))}
                    aria-label={`Remove ${name}`}
                    className="grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                  </button>
                </li>
              );
            })}
          </ul>
          {included.length > shown && (
            <div className="border-t border-[var(--color-border)] px-4 py-3 sm:px-6">
              <button type="button" className="btn-quiet" onClick={() => setShown((n) => n + 200)}>
                Show {Math.min(200, included.length - shown)} more of {included.length}
              </button>
            </div>
          )}
          {included.length === 0 && <div className="px-4 pb-6 text-[15px] text-[var(--color-text-dim)] sm:px-6">Add people from the left. They show up here.</div>}

          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]/50 px-4 py-4 sm:px-6">
            <label htmlFor="skip-days" className="text-[15px] text-[var(--color-text-muted)]">
              Skip anyone emailed in the last
            </label>
            <select id="skip-days" className="field !w-auto !min-h-[40px] !py-1.5" value={skipDays} onChange={(e) => onSkipDays(Number(e.target.value))}>
              {SKIP_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? "Off" : `${d} days`}
                </option>
              ))}
            </select>
          </div>
        </section>

        {groups.length > 0 && (
          <section aria-labelledby="left-out" className="card px-4 py-5 sm:px-6">
            <h2 id="left-out" className="text-[17px] font-semibold text-[var(--color-text)]">
              Left out: {excluded.length}
            </h2>
            <p className="mt-1 text-[15px] text-[var(--color-text-muted)]">These people won&rsquo;t get it. Here&rsquo;s why.</p>
            <ul className="mt-3">
              {groups.map(({ reason, rows }) => {
                const meta = EXCLUDE_LABELS[reason];
                const open = openReason === reason;
                return (
                  <li key={reason} className="border-t border-[var(--color-border)] py-3">
                    <button type="button" aria-expanded={open} onClick={() => setOpenReason(open ? null : reason)} className="flex w-full items-center gap-3 text-left">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${reason === "recent" ? "bg-[var(--color-warm)]" : "bg-[var(--color-text-dim)]"}`} aria-hidden="true" />
                      <span className="flex-1 text-[15.5px] text-[var(--color-text)]">{meta.title}</span>
                      <span className="tabular text-[15px] text-[var(--color-text-muted)]">{rows.length}</span>
                      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" className={`text-[var(--color-text-dim)] transition-transform ${open ? "rotate-180" : ""}`}>
                        <path d="M3 5l4 4 4-4" />
                      </svg>
                    </button>
                    {open && (
                      <div className="mt-2 pl-5">
                        <p className="text-[14px] text-[var(--color-text-dim)]">{meta.why}</p>
                        <ul className="mt-2">
                          {rows.slice(0, 100).map((r) => (
                            <li key={`${reason}-${r.key}`} className="flex items-center gap-3 py-1.5">
                              <span className="min-w-0 flex-1 break-words text-[15px] text-[var(--color-text-muted)]">
                                {recipientName(r)}
                                {r.email && r.email !== recipientName(r) && <span className="text-[var(--color-text-dim)]"> · {r.email}</span>}
                                {r.detail && reason !== "duplicate" && <span className="text-[var(--color-text-dim)]"> · {r.detail}</span>}
                              </span>
                              {meta.overridable && (
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOverride(r.key, true)}>
                                  Include
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
