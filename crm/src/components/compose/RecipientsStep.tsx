"use client";

import { useMemo, useRef, useState } from "react";
import { parseRecipientList } from "@/lib/email/merge";
import { LEAD_STATUSES, LEAD_VIEWS } from "@/lib/store/types";
import { EXCLUDE_LABELS, leadCandidate, recipientName, type AudienceLead, type Candidate, type ExcludeReason, type Recipient } from "./audience";

type Source = "view" | "status" | "source" | "find" | "paste";

const SOURCES: { key: Source; label: string }[] = [
  { key: "view", label: "Lists" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "find", label: "Find" },
  { key: "paste", label: "Paste" },
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
  nurture: "Gone quiet",
};

/** Chips shown before "+N more". */
const CHIP_PAGE = 10;

interface RecipientsStepProps {
  leads: AudienceLead[];
  candidates: Candidate[];
  included: Recipient[];
  excluded: Recipient[];
  /** The server is checking new domains can receive email; anyone that can't moves to Left out. */
  checking: boolean;
  onAdd: (add: Candidate[]) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onOverride: (key: string, include: boolean) => void;
  note: string;
  /** id of the row's "To" label. */
  labelId: string;
}

const X_ICON = (
  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M2 2l6 6M8 2l-6 6" />
  </svg>
);

function SourceRow({ label, n, onAdd, added }: { label: string; n: number; onAdd: () => void; added: number }) {
  const all = added > 0 && added >= n;
  return (
    <li className="flex min-h-[48px] items-center gap-3 border-b border-[var(--color-border)] py-1.5 last:border-0">
      <span className="min-w-0 flex-1 truncate text-[15.5px] text-[var(--color-text)]">{label}</span>
      <span className="tabular text-[14px] text-[var(--color-text-dim)]">{n}</span>
      {all ? (
        <span className="w-[72px] text-center text-[14px] text-[var(--color-success)]">Added</span>
      ) : (
        <button type="button" disabled={n === 0} onClick={onAdd} className="btn btn-secondary btn-sm w-[72px]">
          Add
        </button>
      )}
    </li>
  );
}

// The To line: everyone getting it as removable chips, one "Add people" control that opens the
// ways to add them, and a single line for anyone set aside.
export default function RecipientsStep(props: RecipientsStepProps) {
  const { leads, candidates, included, excluded, checking, onAdd, onRemove, onClear, onOverride, note, labelId } = props;
  const [adding, setAdding] = useState(false);
  const [source, setSource] = useState<Source>("view");
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState<{ text: string; rejected: string[] } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [showLeftOut, setShowLeftOut] = useState(false);
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
    return leads.filter((l) => [l.contactName, l.businessName, l.email].some((v) => v.toLowerCase().includes(q))).slice(0, 8);
  }, [leads, query]);

  function addPasted(text: string, origin: string) {
    const parsed = parseRecipientList(text);
    onAdd(parsed.contacts.map((c) => ({ email: c.email, leadId: null, values: c.values, origin })));
    setPasteNote({
      text: parsed.contacts.length === 0 ? "No email addresses found." : `Added ${parsed.contacts.length}.`,
      rejected: parsed.rejected,
    });
    setPaste("");
  }

  const groups = (Object.keys(EXCLUDE_LABELS) as ExcludeReason[])
    .map((reason) => ({ reason, rows: excluded.filter((r) => r.excluded === reason) }))
    .filter((g) => g.rows.length > 0);

  const chips = showAll ? included : included.slice(0, CHIP_PAGE);

  return (
    <div className="min-w-0 flex-1">
      <ul aria-labelledby={labelId} className="flex flex-wrap items-center gap-1.5" data-user-content>
        {chips.map((r) => {
          const name = recipientName(r);
          return (
            <li
              key={r.key}
              title={r.email}
              className={`inline-flex max-w-[240px] items-center gap-1 rounded-full py-1 pr-1 pl-3 text-[14.5px] text-[var(--color-text)] ${
                r.overridden ? "bg-[var(--color-warm)]/[0.12]" : "bg-[var(--color-bg-secondary)]"
              } shadow-[inset_0_0_0_1px_var(--color-border-bright)]`}
            >
              <span className="truncate">{name}</span>
              <button
                type="button"
                onClick={() => (r.overridden ? onOverride(r.key, false) : onRemove(r.key))}
                aria-label={`Remove ${name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[var(--color-text-dim)] transition-colors hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] focus-visible:outline-2 focus-visible:outline-[var(--color-steel)]"
              >
                {X_ICON}
              </button>
            </li>
          );
        })}
        {included.length > CHIP_PAGE && (
          <li>
            <button type="button" className="btn-quiet px-2 text-[14.5px]" onClick={() => setShowAll((s) => !s)}>
              {showAll ? "Show fewer" : `+${included.length - CHIP_PAGE} more`}
            </button>
          </li>
        )}
        <li>
          <button
            type="button"
            aria-expanded={adding}
            aria-controls="add-people"
            onClick={() => setAdding((a) => !a)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[14.5px] font-medium text-[var(--color-steel)] shadow-[inset_0_0_0_1px_var(--color-steel)] transition-colors hover:bg-[var(--color-steel)]/[0.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-steel)]"
          >
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 1.5v9M1.5 6h9" />
            </svg>
            Add people
          </button>
        </li>
      </ul>

      {(note || checking || excluded.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-[var(--color-text-dim)]">
          {note && <span>{note}</span>}
          {checking && <span role="status">Checking addresses</span>}
          {excluded.length > 0 && (
            <button type="button" aria-expanded={showLeftOut} onClick={() => setShowLeftOut((s) => !s)} className="btn-quiet text-[14px]">
              {excluded.length} left out
            </button>
          )}
        </div>
      )}

      {showLeftOut && groups.length > 0 && (
        <ul className="well mt-2 px-4 py-2" data-user-content>
          {groups.map(({ reason, rows }) => {
            const meta = EXCLUDE_LABELS[reason];
            return (
              <li key={reason} className="border-b border-[var(--color-border)] py-2.5 last:border-0">
                <div className="flex items-baseline gap-3 text-[15px] text-[var(--color-text)]">
                  <span className="flex-1">{meta.title}</span>
                  <span className="tabular text-[var(--color-text-dim)]">{rows.length}</span>
                </div>
                <ul className="mt-1">
                  {rows.slice(0, 100).map((r) => (
                    <li key={`${reason}-${r.key}`} className="flex items-center gap-3 py-1">
                      <span className="min-w-0 flex-1 truncate text-[14.5px] text-[var(--color-text-muted)]">
                        {recipientName(r)}
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
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div id="add-people" className="well mt-3 p-3 sm:p-4">
          <div className="flex items-start gap-2">
            <div role="tablist" aria-label="Add from" className="flex min-w-0 flex-1 flex-wrap gap-1">
              {SOURCES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={source === s.key}
                  onClick={() => setSource(s.key)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[14.5px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-steel)] ${
                    source === s.key ? "bg-[var(--color-steel)]/[0.14] font-medium text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-steel)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={() => setAdding(false)}>
              Done
            </button>
          </div>

          <div role="tabpanel" className="mt-2" data-user-content>
            {source === "view" && (
              <ul>
                {LEAD_VIEWS.map((v) => {
                  const group = v.key === "all" ? withEmail : withEmail.filter((l) => l.views.includes(v.key));
                  return <SourceRow key={v.key} label={v.label} n={group.length} added={addedOf(group)} onAdd={() => addGroup(group, `${v.label} view`)} />;
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
                {sources.length === 0 && <li className="py-3 text-[15px] text-[var(--color-text-dim)]">No leads with an email.</li>}
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
                <input id="find-lead" className="field" placeholder="Name, company or email" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" autoFocus />
                <ul className="mt-1">
                  {query.trim() && matches.length === 0 && <li className="py-3 text-[15px] text-[var(--color-text-dim)]">No match.</li>}
                  {matches.map((l) => {
                    const name = l.contactName || l.businessName;
                    const added = onList.has(l.id);
                    return (
                      <li key={l.id} className="flex min-h-[48px] items-center gap-3 border-b border-[var(--color-border)] py-1.5 last:border-0">
                        <span className="min-w-0 flex-1 truncate text-[15.5px] text-[var(--color-text)]">
                          {name}
                          <span className="text-[var(--color-text-dim)]"> · {l.email || "no email"}</span>
                        </span>
                        {added ? (
                          <span className="w-[72px] text-center text-[14px] text-[var(--color-success)]">Added</span>
                        ) : (
                          <button type="button" className="btn btn-secondary btn-sm w-[72px]" disabled={!l.email.trim()} onClick={() => onAdd([leadCandidate(l, "Added by hand")])}>
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
                <label htmlFor="paste-list" className="sr-only">
                  Paste emails or a spreadsheet
                </label>
                <textarea
                  id="paste-list"
                  className="field min-h-[120px] font-mono text-[14px] leading-relaxed"
                  placeholder={"Emails, or name,email,company rows"}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button type="button" className="btn btn-secondary btn-sm" disabled={!paste.trim()} onClick={() => addPasted(paste, "Pasted list")}>
                    Add
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => file.current?.click()}>
                    Upload CSV
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
                        setPasteNote({ text: "That file is over 2 MB.", rejected: [] });
                        return;
                      }
                      addPasted(await f.text(), f.name);
                    }}
                  />
                  {pasteNote && (
                    <span role="status" className="text-[14.5px] text-[var(--color-text-muted)]">
                      {pasteNote.text}
                      {pasteNote.rejected.length > 0 && ` ${pasteNote.rejected.length} ${pasteNote.rejected.length === 1 ? "line" : "lines"} skipped.`}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {candidates.length > 0 && (
            <div className="mt-2 border-t border-[var(--color-border)] pt-2 text-right">
              <button type="button" className="btn-quiet text-[14px]" onClick={onClear}>
                Remove everyone
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
