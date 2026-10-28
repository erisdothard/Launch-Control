"use client";

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { moveKey, type NavKey } from "@/lib/nav/order";

// Reorder mode for the main nav: drag by the handle (mouse, touch, or keyboard: Space to lift, arrows
// to move, Space to drop), or use the up/down buttons for anyone who'd rather not drag.

export interface ReorderItem {
  key: NavKey;
  label: string;
  icon: React.ReactNode;
  /** A line under the label for children that move with it ("Drafts moves with it"). */
  note?: string;
}

interface NavReorderProps {
  items: ReorderItem[];
  onChange: (order: NavKey[]) => void;
  onDone: () => void;
  onReset: () => void;
  /** Phone sheet: larger rows. */
  large?: boolean;
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={up ? "M3.5 10L8 5.5l4.5 4.5" : "M3.5 6L8 10.5 12.5 6"} />
    </svg>
  );
}

const stepBtn =
  "grid h-9 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] disabled:opacity-30 disabled:hover:bg-transparent";

function Row({ item, index, count, order, onChange, large }: { item: ReorderItem; index: number; count: number; order: NavKey[]; onChange: (o: NavKey[]) => void; large?: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-bg-card)] py-1 pr-1 pl-1 ${large ? "min-h-[56px]" : "min-h-[46px]"} ${
        isDragging ? "z-10 shadow-[inset_0_0_0_1px_var(--color-steel),0_10px_30px_rgba(0,0,0,0.5)]" : "shadow-[inset_0_0_0_1px_var(--color-border)]"
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Drag to move ${item.label}`}
        className="grid h-9 w-8 shrink-0 cursor-grab touch-none place-items-center rounded-[var(--radius-sm)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] active:cursor-grabbing"
      >
        <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor" aria-hidden="true">
          {[3, 9, 15].flatMap((y) => [<circle key={`a${y}`} cx="4" cy={y} r="1.5" />, <circle key={`b${y}`} cx="10" cy={y} r="1.5" />])}
        </svg>
      </button>
      {/* The sidebar is narrow: the label gets the room there, the icon only on the phone sheet. */}
      {large && <span className="shrink-0 text-[var(--color-text-muted)]">{item.icon}</span>}
      <span className={`min-w-0 flex-1 ${large ? "pl-1.5" : ""}`}>
        <span className={`block truncate text-[var(--color-text)] ${large ? "text-[16px]" : "text-[15px]"}`}>{item.label}</span>
        {item.note && <span className="block truncate text-[14px] text-[var(--color-text-dim)]">{item.note}</span>}
      </span>
      <button type="button" className={stepBtn} aria-label={`Move ${item.label} up`} disabled={index === 0} onClick={() => onChange(moveKey(order, item.key, -1))}>
        <Arrow up />
      </button>
      <button type="button" className={stepBtn} aria-label={`Move ${item.label} down`} disabled={index === count - 1} onClick={() => onChange(moveKey(order, item.key, 1))}>
        <Arrow up={false} />
      </button>
    </li>
  );
}

export default function NavReorder({ items, onChange, onDone, onReset, large }: NavReorderProps) {
  const order = items.map((i) => i.key);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(order, order.indexOf(active.id as NavKey), order.indexOf(over.id as NavKey)));
  }

  return (
    <div role="group" aria-label="Reorder the menu">
      <p className="mb-2 px-1 text-[14px] text-[var(--color-text-dim)]">Drag the handle, or use the arrows.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <Row key={item.key} item={item} index={i} count={items.length} order={order} onChange={onChange} large={large} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className={`mt-3 flex gap-2 ${large ? "items-center" : "flex-col"}`}>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex h-10 shrink-0 grow items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-accent)] px-4 text-[15px] font-semibold text-[var(--color-on-accent)] [@media(hover:hover)]:hover:bg-[var(--color-accent-hover)]"
        >
          Done
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] px-3 text-[15px] text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border-bright)] hover:text-[var(--color-text)] hover:shadow-[inset_0_0_0_1px_var(--color-steel)]"
        >
          Reset to default
        </button>
      </div>
    </div>
  );
}
