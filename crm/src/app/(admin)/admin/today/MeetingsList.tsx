"use client";

import Link from "next/link";
import type { MeetingItem } from "@/lib/today/types";
import { ClockTime } from "./ClockTime";

export default function MeetingsList({ meetings }: { meetings: MeetingItem[] }) {
  return (
    <ul className="card divide-y divide-[var(--color-border)]">
      {meetings.map((m) => (
        <li key={m.id} className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 sm:px-5">
          <span className="w-full whitespace-nowrap font-mono tabular-nums text-[var(--color-text-muted)] sm:w-52">
            {m.allDay ? (
              "All day"
            ) : (
              <>
                <ClockTime iso={m.startsAt} /> – <ClockTime iso={m.endsAt} />
              </>
            )}
          </span>
          <span className="min-w-0 flex-1 basis-40">
            <span className="font-medium text-[var(--color-text)]">{m.title}</span>
            {m.leadId && m.leadName && (
              <>
                <span className="text-[var(--color-text-dim)]"> · </span>
                <Link href={`/admin/leads/${m.leadId}`} className="link">
                  {m.leadName}
                </Link>
              </>
            )}
            {!m.joinUrl && m.location && <span className="block truncate t-small text-[var(--color-text-dim)]">{m.location}</span>}
          </span>
          {m.joinUrl && (
            <a href={m.joinUrl} target="_blank" rel="noopener noreferrer" className="btn-quiet -mr-3">
              {m.joinUrl === m.location.trim() ? "Join" : "Open in Outlook"}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
