"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useMounted } from "@/components/admin/LocalDate";
import Link from "next/link";
import { WORK_LABELS, type Task, type TaskRelatedType, type WorkCounts } from "@/lib/store/types";
import { createTaskAction, setTaskDoneAction, deleteTaskAction } from "./actions";

interface RelatedOption {
  type: TaskRelatedType;
  id: string;
  label: string;
}

interface TasksListClientProps {
  tasks: Task[];
  relatedOptions: RelatedOption[];
  /** The same counts Today shows, so this page never says "nothing to do" while Today has work. */
  work: WorkCounts;
}

/** Replies, follow-ups and new inquiries live on Today; this says how many, with a way there. */
function TodaySummary({ work }: { work: WorkCounts }) {
  const rows = [
    { label: WORK_LABELS.reply, one: "reply needed", n: work.replies, href: "/admin/leads?view=needs-reply", tone: "text-[var(--color-hot)]" },
    { label: WORK_LABELS.followup, one: "follow-up due", n: work.followUps, href: "/admin/leads?view=follow-up", tone: "text-[var(--color-warm)]" },
    { label: WORK_LABELS.new, one: "new inquiry", n: work.inquiries, href: "/admin/leads?view=new-inquiries", tone: "text-[var(--color-text)]" },
  ];
  const total = work.replies + work.followUps + work.inquiries;
  return (
    <section aria-labelledby="on-today-heading" className="well flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 id="on-today-heading" className="text-[15px] font-normal text-[var(--color-text-dim)]">
          On Today
        </h2>
        <p className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[16px] text-[var(--color-text-muted)]">
          {rows.map((r) => (
            <Link key={r.label} href={r.href} className="hover:text-[var(--color-text)]">
              <span className={`tabular font-semibold ${r.n > 0 ? r.tone : "text-[var(--color-text-dim)]"}`}>{r.n}</span> {r.n === 1 ? r.one : r.label.toLowerCase()}
            </Link>
          ))}
        </p>
      </div>
      {total > 0 && (
        <Link href="/admin/dashboard" className="btn btn-secondary btn-sm shrink-0 self-start sm:self-auto">
          Go to Today
        </Link>
      )}
    </section>
  );
}

type DueState = "overdue" | "today" | "later" | "none";

// Due dates are calendar days ("2026-10-21"). Parse them as the viewer's local day: new Date() on a
// bare date reads it as UTC midnight, which is the previous evening anywhere in the Americas.
function localDay(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dueState(dueDate: string | null, done: boolean): DueState {
  if (!dueDate || done) return dueDate ? "later" : "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = localDay(dueDate).getTime();
  if (due < today.getTime()) return "overdue";
  if (due === today.getTime()) return "today";
  return "later";
}

function dueLabel(dueDate: string, state: DueState): string {
  if (state === "today") return "Due today";
  const day = localDay(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return state === "overdue" ? `Overdue since ${day}` : `Due ${day}`;
}

const DUE_CLASS: Record<DueState, string> = {
  overdue: "text-[var(--color-hot)] font-medium",
  today: "text-[var(--color-warm)] font-medium",
  later: "text-[var(--color-text-muted)]",
  none: "",
};

function TaskRow({
  task,
  mounted,
  onToggle,
  onDelete,
}: {
  task: Task;
  mounted: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const state = dueState(task.dueDate, task.done);
  return (
    <li className="group flex items-start gap-4 border-b border-[var(--color-border)] py-4 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-label={task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
        className="-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      >
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150 ${
            task.done
              ? "bg-[var(--color-steel)] text-[var(--color-on-accent)]"
              : "text-transparent shadow-[inset_0_0_0_1.5px_var(--color-border-bright)] hover:text-[var(--color-text-dim)] hover:shadow-[inset_0_0_0_1.5px_var(--color-steel)]"
          }`}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 8l3.5 3.5L13 5" />
          </svg>
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <p className={`text-base leading-snug ${task.done ? "text-[var(--color-text-dim)] line-through" : "font-medium text-[var(--color-text)]"}`}>
          {task.title}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-[var(--color-text-dim)]">
          {task.relatedLabel && (
            <span>
              {task.relatedType === "lead" ? "Lead" : "Deal"} · {task.relatedLabel}
            </span>
          )}
          {task.dueDate && mounted && <span className={`tabular ${DUE_CLASS[state]}`}>{dueLabel(task.dueDate, state)}</span>}
          {!task.dueDate && !task.relatedLabel && <span>No due date</span>}
        </p>
      </div>

      <button
        type="button"
        onClick={onDelete}
        className="-my-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--color-text-dim)] transition-colors duration-150 hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-hot)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        aria-label={`Delete ${task.title}`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 4h10M6.5 4V2.5h3V4M6 7v4M10 7v4M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1l.5-9" />
        </svg>
      </button>
    </li>
  );
}

export default function TasksListClient({ tasks, relatedOptions, work }: TasksListClientProps) {
  const router = useRouter();
  const mounted = useMounted();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [relatedKey, setRelatedKey] = useState("");
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const related = relatedOptions.find((o) => `${o.type}:${o.id}` === relatedKey) ?? null;

    startTransition(async () => {
      await createTaskAction({
        title,
        dueDate: dueDate || null,
        relatedType: related?.type ?? null,
        relatedId: related?.id ?? null,
        relatedLabel: related?.label ?? null,
      });
      router.refresh();
    });

    setTitle("");
    setDueDate("");
    setRelatedKey("");
  }

  function handleToggle(id: string, next: boolean) {
    startTransition(async () => {
      await setTaskDoneAction(id, next);
      router.refresh();
    });
  }

  function handleDelete(id: string, taskTitle: string) {
    if (!confirm(`Delete "${taskTitle}"? This can't be undone.`)) return;
    startTransition(async () => {
      await deleteTaskAction(id);
      router.refresh();
    });
  }

  const row = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      mounted={mounted}
      onToggle={() => handleToggle(task.id, !task.done)}
      onDelete={() => handleDelete(task.id, task.title)}
    />
  );

  return (
    <div className="max-w-[900px]">
      <TodaySummary work={work} />
      <form onSubmit={handleAdd} className="card mt-6 p-5 sm:p-6" aria-labelledby="add-task-heading">
        <h2 id="add-task-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
          Add a task
        </h2>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] lg:grid-cols-[minmax(0,1fr)_11rem_14rem_auto]">
          <label className="block sm:col-span-2 lg:col-span-1">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">What needs doing</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call Dana about the third car" required className="field" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">Due</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="field" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-[var(--color-text-dim)]">For</span>
            <select value={relatedKey} onChange={(e) => setRelatedKey(e.target.value)} className="field">
              <option value="">Nobody in particular</option>
              {relatedOptions.map((o) => (
                <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
                  {o.type === "lead" ? "Lead" : "Deal"} · {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <button type="submit" disabled={!title.trim()} className="btn btn-primary w-full lg:w-auto">
              Add task
            </button>
          </div>
        </div>
      </form>

      <section aria-labelledby="open-heading" className="mt-9">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 id="open-heading" className="text-[17px] font-semibold text-[var(--color-text)]">
            Additional tasks
          </h2>
          <span className="text-sm text-[var(--color-text-dim)] tabular">{open.length}</span>
        </div>
        {open.length === 0 ? (
          <p className="border-t border-[var(--color-border)] py-6 text-base text-[var(--color-text-muted)]">
            No additional tasks. Add one above when something comes up that the CRM doesn&apos;t track for you.
          </p>
        ) : (
          <ul className="border-t border-[var(--color-border)]">{open.map(row)}</ul>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="done-heading" className="mt-9">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 id="done-heading" className="text-[17px] font-semibold text-[var(--color-text-muted)]">
              Done
            </h2>
            <span className="text-sm text-[var(--color-text-dim)] tabular">{done.length}</span>
          </div>
          <ul className="border-t border-[var(--color-border)]">{done.map(row)}</ul>
        </section>
      )}
    </div>
  );
}
