"use client";

import { useState } from "react";

export type SettingsTab = "signatures" | "autopilot" | "company";

interface TabInfo {
  id: SettingsTab;
  label: string;
  /** One line under the label: where this part stands right now. */
  status: string;
  /** Red dot when something here has stopped working. */
  alert?: boolean;
}

const ICON = "h-[22px] w-[22px] shrink-0";

export const TAB_ICONS: Record<SettingsTab, React.ReactNode> = {
  signatures: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M3 17c3-1 4.5-6 6-6s.5 5 2.5 5 2.5-3 4-3 1.5 2 5.5 2" />
      <path d="M3 21h18" />
    </svg>
  ),
  autopilot: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <circle cx="12" cy="12" r="5" />
      <path d="m12 12 2.5-2.5" />
    </svg>
  ),
  company: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 10h4a1 1 0 0 1 1 1v10M2 21h20M8 8h3M8 12h3M8 16h3" />
    </svg>
  ),
};

// Older links into Settings (#email-accounts) land on Signatures, the default tab.

export default function SettingsTabs({
  tabs,
  initial,
  panels,
}: {
  tabs: TabInfo[];
  initial: SettingsTab;
  panels: Record<SettingsTab, React.ReactNode>;
}) {
  const [active, setActive] = useState<SettingsTab>(initial);

  function pick(id: SettingsTab) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = "";
    window.history.replaceState(null, "", url);
  }

  function onKey(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    pick(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Settings" className="grid grid-cols-3 gap-2 sm:gap-3">
        {tabs.map((tab, i) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${tab.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => pick(tab.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={`group relative flex min-h-[64px] flex-col items-start gap-1 overflow-hidden rounded-[var(--radius-lg)] px-3 py-3 text-left transition-colors duration-150 sm:flex-row sm:items-center sm:gap-4 sm:px-5 sm:py-4 ${
                on
                  ? "bg-[var(--color-bg-card)] text-[var(--color-text)] shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
                  : "text-[var(--color-text-muted)] shadow-[inset_0_0_0_1px_var(--color-border)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)] hover:shadow-[inset_0_0_0_1px_var(--color-border-bright)]"
              }`}
            >
              <span className={`relative ${on ? "text-[var(--color-accent)]" : ""}`}>
                {TAB_ICONS[tab.id]}
                {tab.alert && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--color-hot)]" aria-label="needs attention" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold sm:text-[17px]">{tab.label}</span>
                <span className={`hidden truncate text-sm sm:block ${tab.alert ? "text-[var(--color-hot)]" : "text-[var(--color-text-dim)]"}`}>{tab.status}</span>
              </span>
              {/* The livery stripe marks the tab you're on. */}
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 flex h-[3px] origin-left transition-transform duration-300 ease-[var(--ease-out-expo)] ${on ? "scale-x-100" : "scale-x-0"}`}
              >
                <span className="flex-[5] bg-[var(--color-accent)]" />
                <span className="flex-[3] bg-[var(--color-livery-orange)]" />
                <span className="flex-[2] bg-[var(--color-livery-red)]" />
              </span>
            </button>
          );
        })}
      </div>

      {tabs.map((tab) => (
        <div key={tab.id} id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={tab.id !== active} className="mt-6 sm:mt-8">
          {panels[tab.id]}
        </div>
      ))}
    </div>
  );
}
