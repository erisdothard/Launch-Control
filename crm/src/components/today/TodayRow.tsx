"use client";

import type { TodayItem } from "@/lib/store/today";
import Dropdown from "./Dropdown";
import { Avatar } from "./shared";
import { canSend, chipFor, labelFor, peekFor, whenFor } from "./groups";
import styles from "./board.module.css";

export type RowAct = "edit" | "open" | "skip";

interface TodayRowProps {
  item: TodayItem;
  selected: boolean;
  leaving: boolean;
  onOpen: () => void;
  onSend: () => void;
  onAct: (act: RowAct) => void;
}

export function Chip({ item }: { item: TodayItem }) {
  const chip = chipFor(item);
  return <span className={`${styles.chip} ${styles[`c-${chip.tone}`]}`}>{chip.text}</span>;
}

// One person, one line: who, what they said (or which follow-up), one chip, and when. Hovering
// swaps the time for Send and "…"; clicking anywhere else on the row opens the draft.
export default function TodayRow({ item, selected, leaving, onOpen, onSend, onAct }: TodayRowProps) {
  const peek = peekFor(item);
  const chip = chipFor(item);
  const sendable = canSend(item);

  return (
    <li className={`${styles.row} ${selected ? styles.sel : ""} ${leaving ? styles.leave : ""}`} onClick={onOpen}>
      <Avatar name={item.name} initials={item.initials} size={32} />
      <div className={styles.who}>
        <button type="button" className={styles.nm} data-open={item.key} aria-label={`Open ${labelFor(item)}, ${chip.text}`} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
          {item.name}
        </button>
        {item.company && (
          <>
            <span className={styles.sep}> · </span>
            <span className={styles.co}>{item.company}</span>
          </>
        )}
      </div>
      <div className={styles.peek}>{peek.quoted ? <q>{peek.text}</q> : peek.text}</div>
      <Chip item={item} />
      <span className={styles.when}>{whenFor(item)}</span>
      <span className={styles.acts} onClick={(e) => e.stopPropagation()}>
        {sendable && (
          <button type="button" className={`${styles.btn} ${styles.secondary} ${styles.sm}`} aria-label={`Send to ${item.name}`} onClick={onSend}>
            Send
          </button>
        )}
        <Dropdown
          className={styles.iconBtn}
          ariaLabel={`More for ${item.name}`}
          menuLabel="Row actions"
          placement="down-right"
          label={
            <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
              <circle cx="4" cy="9" r="1.5" />
              <circle cx="9" cy="9" r="1.5" />
              <circle cx="14" cy="9" r="1.5" />
            </svg>
          }
        >
          {(close) => (
            <>
              {sendable && (
                <button type="button" role="menuitem" onClick={() => { close(); onAct("edit"); }}>
                  Edit the email
                </button>
              )}
              <button type="button" role="menuitem" onClick={() => { close(); onAct("open"); }}>
                Open their record
              </button>
              <button type="button" role="menuitem" onClick={() => { close(); onAct("skip"); }}>
                Skip for now
              </button>
            </>
          )}
        </Dropdown>
      </span>
    </li>
  );
}
