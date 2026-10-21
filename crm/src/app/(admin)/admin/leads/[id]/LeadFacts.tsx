"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import LocalDate from "@/components/admin/LocalDate";
import {
  CalendarIcon,
  ClockIcon,
  FlagIcon,
  GlobeIcon,
  MailIcon,
  NoteIcon,
  PhoneIcon,
  PinIcon,
  ReplyIcon,
  SourceIcon,
} from "@/components/records/icons";
import { AUTOMATED_LEAD_SOURCE, type Lead } from "@/lib/store/types";
import { updateLeadAction } from "../actions";

// The facts column: icon-led fields (Attio/Close record pattern). Edit turns the same card into
// fields in place, so Max never loses his spot on the page.

interface LeadFactsProps {
  lead: Lead;
  editing: boolean;
  onDone: () => void;
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3 border-b border-[var(--color-border)] py-3 last:border-0">
      <span className="pt-[3px] text-[var(--color-text-dim)]">{icon}</span>
      <div className="min-w-0">
        <dt className="text-sm text-[var(--color-text-dim)]">{label}</dt>
        <dd className="mt-0.5 text-[15px] break-words text-[var(--color-text)]">{children}</dd>
      </div>
    </div>
  );
}

const Empty = ({ children = "Not on file" }: { children?: React.ReactNode }) => (
  <span className="text-[var(--color-text-dim)]">{children}</span>
);

function followUpDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function LeadFacts({ lead, editing, onDone }: LeadFactsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ businessName: lead.businessName, email: lead.email, phone: lead.phone, notes: lead.notes });
  const firstField = useRef<HTMLInputElement>(null);
  const card = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!editing) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
    firstField.current?.focus({ preventScroll: true });
  }, [editing]);

  function cancel() {
    setForm({ businessName: lead.businessName, email: lead.email, phone: lead.phone, notes: lead.notes });
    setError(null);
    onDone();
  }

  function save() {
    if (!form.businessName.trim()) {
      setError("The business needs a name.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateLeadAction(lead.id, { ...form, businessName: form.businessName.trim() });
        onDone();
        router.refresh();
      } catch {
        setError("That didn't save. Check the connection and try again.");
      }
    });
  }

  const p = lead.prospect;
  const website = p?.website && /^https?:\/\//.test(p.website) ? p.website : null;
  const place = [p?.city, p?.state].filter(Boolean).join(", ");
  const source = lead.source === AUTOMATED_LEAD_SOURCE ? "Lead gen" : lead.source;

  if (editing) {
    return (
      <section ref={card} aria-labelledby="facts-heading" className="card p-5 sm:p-6">
        <h2 id="facts-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
          Edit details
        </h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Business name</span>
            <input ref={firstField} className="field" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Email</span>
            <input type="email" className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Phone</span>
            <input type="tel" className="field" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Notes</span>
            <textarea rows={5} className="field leading-relaxed" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {error && (
            <p role="alert" className="text-[15px] text-[var(--color-hot)]">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Saving" : "Save"}
            </button>
            <button type="button" onClick={cancel} disabled={pending} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section ref={card} aria-labelledby="facts-heading" className="card px-5 pt-4 pb-2 sm:px-6">
      <h2 id="facts-heading" className="sr-only">
        Details
      </h2>
      <dl>
        <Row icon={<MailIcon />} label="Email">
          {lead.email ? (
            <a href={`mailto:${lead.email}`} className="hover:underline">
              {lead.email}
            </a>
          ) : (
            <Empty />
          )}
        </Row>
        <Row icon={<PhoneIcon />} label="Phone">
          {lead.phone ? (
            <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="tabular hover:underline">
              {lead.phone}
            </a>
          ) : (
            <Empty />
          )}
        </Row>
        {(website || p?.domain) && (
          <Row icon={<GlobeIcon />} label="Website">
            {website ? (
              <a href={website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                {p?.domain ?? website.replace(/^https?:\/\//, "")}
              </a>
            ) : (
              p?.domain
            )}
          </Row>
        )}
        {place && (
          <Row icon={<PinIcon />} label="Location">
            {place}
          </Row>
        )}
        <Row icon={<SourceIcon />} label="Source">
          {source || <Empty>Unknown</Empty>}
        </Row>
        <Row icon={<CalendarIcon />} label="Added">
          <LocalDate iso={lead.createdAt} options={SHORT_DATE} />
        </Row>
        <Row icon={<ClockIcon />} label="Last emailed">
          {lead.lastContactedAt ? <LocalDate iso={lead.lastContactedAt} options={SHORT_DATE} /> : <Empty>Not yet</Empty>}
        </Row>
        {lead.lastReplyAt && (
          <Row icon={<ReplyIcon />} label="Last reply from them">
            <LocalDate iso={lead.lastReplyAt} options={SHORT_DATE} />
          </Row>
        )}
        <Row icon={<FlagIcon />} label="Next follow-up">
          {lead.followUpOn ? followUpDate(lead.followUpOn) : <Empty>None set</Empty>}
          {lead.followUpCount > 0 && (
            <span className="text-[var(--color-text-dim)]">
              {" · "}
              {lead.followUpCount === 1 ? "one sent" : `${lead.followUpCount} sent`}
            </span>
          )}
        </Row>
        <Row icon={<NoteIcon />} label="Notes">
          {lead.notes ? <span className="whitespace-pre-wrap">{lead.notes}</span> : <Empty>No notes yet</Empty>}
        </Row>
      </dl>
    </section>
  );
}
