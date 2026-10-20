"use client";

import LocalDate from "@/components/admin/LocalDate";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Task, TaskRelatedType } from "@/lib/store/types";
import { createTaskAction, setTaskDoneAction, deleteTaskAction } from "./actions";

const inputClass =
  "rounded-[2px] border border-transparent bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]/50 focus:ring-1 focus:ring-[var(--color-accent)]/30";

interface RelatedOption {
  type: TaskRelatedType;
  id: string;
  label: string;
}

interface TasksListClientProps {
  tasks: Task[];
  relatedOptions: RelatedOption[];
}

function formatDueDate(iso: string) {
  return <LocalDate iso={iso} options={{ month: "short", day: "numeric" }} />;
}

function isOverdue(dueDate: string | null, done: boolean): boolean {
  if (!dueDate || done) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate) < today;
}

export default function TasksListClient({ tasks, relatedOptions }: TasksListClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [relatedKey, setRelatedKey] = useState("");

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

  function handleToggle(id: string, done: boolean) {
    startTransition(async () => {
      await setTaskDoneAction(id, done);
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

  return (
    <div>
      <form
        onSubmit={handleAdd}
        className="mb-4 flex flex-col gap-3 rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 sm:flex-row sm:items-center"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Follow up with..."
          required
          className={`${inputClass} flex-1`}
        />
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={`${inputClass} shrink-0`}
        />
        <select value={relatedKey} onChange={(e) => setRelatedKey(e.target.value)} className={`${inputClass} shrink-0`}>
          <option value="">Not related</option>
          {relatedOptions.map((o) => (
            <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
              {o.type === "lead" ? "Lead" : "Deal"} — {o.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[2px] bg-[var(--color-accent)] px-4 py-2 font-display text-[11px] uppercase tracking-[var(--tracking-signage)] text-[var(--color-on-accent)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M8 3v10M3 8h10" />
          </svg>
          Add Task
        </button>
      </form>

      <div className="rounded-[2px] border border-[var(--color-border)] bg-[var(--color-bg-card)]">
        {tasks.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-text-dim)]">
            No tasks yet — add a follow-up above.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {tasks.map((task) => {
              const overdue = isOverdue(task.dueDate, task.done);
              return (
                <li key={task.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(task.id, !task.done)}
                    aria-label={task.done ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      task.done
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                        : "border-[var(--color-border-bright)] text-transparent hover:border-[var(--color-accent)]"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 8l3.5 3.5L13 5" />
                    </svg>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${
                        task.done ? "text-[var(--color-text-dim)] line-through" : "text-[var(--color-text)]"
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.relatedLabel && (
                      <p className="truncate text-xs text-[var(--color-text-dim)]">
                        {task.relatedType === "lead" ? "Lead" : "Deal"} — {task.relatedLabel}
                      </p>
                    )}
                  </div>

                  {task.dueDate && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        overdue ? "bg-red-400/10 text-red-400" : "bg-[var(--color-bg-secondary)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      {overdue ? "Overdue " : ""}
                      {formatDueDate(task.dueDate)}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(task.id, task.title)}
                    className="shrink-0 rounded-[2px] p-1.5 text-[var(--color-text-dim)] transition-colors hover:bg-red-400/10 hover:text-red-400"
                    aria-label={`Delete ${task.title}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 4h10M6.5 4V2.5h3V4M6 7v4M10 7v4M4 4l.5 9a1 1 0 001 1h5a1 1 0 001-1l.5-9" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
