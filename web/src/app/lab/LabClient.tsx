"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { launchToFlash, rpmToStrength, type FxQuality, type FxState } from "@/components/fx/fxState";
import { LAB_RANGES, labClock, labState } from "./labState";

const LabScene = dynamic(() => import("./LabScene").then((m) => m.LabScene), { ssr: false });

type LabApi = {
  set: (partial: Partial<FxState>) => void;
  get: () => FxState;
  freezeTime: (seconds: number) => void;
  unfreeze: () => void;
  setQuality: (q: FxQuality) => void;
};

declare global {
  interface Window {
    __lab?: LabApi;
  }
}

const SLIDERS = Object.keys(LAB_RANGES) as Array<keyof typeof LAB_RANGES>;

export function LabClient() {
  const [ui, setUi] = useState<FxState>({ ...labState });
  const [quality, setQuality] = useState<FxQuality>("high");
  const [frozen, setFrozen] = useState(false);

  const apply = useCallback((partial: Partial<FxState>) => {
    Object.assign(labState, partial);
    setUi({ ...labState });
  }, []);

  const freeze = useCallback((seconds: number) => {
    labClock.frozen = true;
    labState.time = seconds;
    setFrozen(true);
  }, []);

  const unfreeze = useCallback(() => {
    labClock.frozen = false;
    setFrozen(false);
  }, []);

  useEffect(() => {
    window.__lab = { set: apply, get: () => ({ ...labState }), freezeTime: freeze, unfreeze, setQuality };
    return () => {
      delete window.__lab;
    };
  }, [apply, freeze, unfreeze]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background">
      <LabScene quality={quality} />

      <aside
        aria-label="FX uniforms"
        className="absolute right-4 top-4 z-10 w-72 border border-border bg-surface/95 p-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted"
      >
        <h1 className="mb-3 text-[12px] font-medium text-text">FX lab</h1>

        {SLIDERS.map((key) => {
          const range = LAB_RANGES[key];
          return (
            <label key={key} className="mb-3 block">
              <span className="flex justify-between">
                <span>{key}</span>
                <span className="text-ember tabular-nums">{ui[key].toFixed(key === "rpm" ? 0 : 2)}</span>
              </span>
              <input
                type="range"
                name={key}
                min={range.min}
                max={range.max}
                step={range.step}
                value={ui[key]}
                onChange={(e) => apply({ [key]: Number(e.target.value) })}
                className="mt-1 w-full accent-ember"
              />
            </label>
          );
        })}

        <label className="mb-3 flex items-center justify-between">
          <span>quality</span>
          <select
            name="quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value as FxQuality)}
            className="border border-subtle bg-elevated px-2 py-1 text-text"
          >
            <option value="high">high</option>
            <option value="mid">mid</option>
            <option value="low">low</option>
          </select>
        </label>

        <label className="mb-3 flex items-center justify-between">
          <span>freeze time</span>
          <input
            type="checkbox"
            name="freeze"
            checked={frozen}
            onChange={(e) => (e.target.checked ? freeze(labState.time) : unfreeze())}
            className="accent-ember"
          />
        </label>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-subtle">
          <dt>distort</dt>
          <dd className="text-right tabular-nums">{rpmToStrength(ui.rpm).toFixed(2)}</dd>
          <dt>flash</dt>
          <dd className="text-right tabular-nums">{launchToFlash(ui.launch).toFixed(2)}</dd>
        </dl>

        <div className="mt-3 flex gap-2">
          <PresetButton label="idle" onClick={() => apply({ rpm: 800, fog: 0.1, combustion: 0, launch: 0 })} />
          <PresetButton label="rev" onClick={() => apply({ rpm: 6000, fog: 0.7, combustion: 0.8, launch: 0 })} />
          <PresetButton label="launch" onClick={() => apply({ rpm: 7400, fog: 0.4, combustion: 1, launch: 1 })} />
        </div>
      </aside>
    </main>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 border border-subtle px-2 py-1 text-text transition-colors duration-[120ms] hover:border-ember hover:text-ember focus-visible:border-ember focus-visible:outline-none"
    >
      {label}
    </button>
  );
}
