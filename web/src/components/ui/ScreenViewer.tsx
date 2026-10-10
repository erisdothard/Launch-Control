"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { Shot } from "@/content/site";
import { site } from "@/content/site";
import { BrowserFrame, PhoneFrame } from "@/components/ui/Frame";

export interface Screen {
  label: string;
  note: string;
  desk?: Shot;
  phone: Shot;
}

/*
  One frame per project and a list of what is inside it. Click a row or an arrow and the frame
  crossfades to that screen; a 01 / 03 counter ticks. Nothing scrolls sideways and nothing peeks
  past the column, so every project reads the same.

  Two shapes from the same parts:
  - Desktop captures (the CRM): the list runs above the frame as three columns and the frame
    takes the whole column width, where a 1280 capture renders near 86% and stays readable.
  - Phone-only captures (a phone-first app): the project's copy (`lead`) and the list share the
    left column and one phone frame sits on the right, near 1:1, spanning both rows.
  On a phone both collapse to lead, frame, then the list.

  Every frame stays mounted, stacked, so the fade is instant after the first load. The hidden
  desktop or phone variant of each capture is lazy, so the browser fetches only the one it shows.
*/

const DESK_SIZES = "(min-width: 1200px) 1104px, 100vw";
const PHONE_IN_DESK_SIZES = "78vw";
const PHONE_ROW_SIZES = "(min-width: 1024px) 380px, (min-width: 640px) 50vw, 78vw";

/*
  Fit the frame to the window. A 1280x800 capture at full column width is 715px tall, which with the
  list above it overruns a 900px laptop window, so the frame's width is capped by the window height:
  (100vh minus the room the label, controls and list take) times the capture's aspect ratio. On a
  tall window that is wider than the column and nothing changes; on a short one the frame narrows,
  centred, and the whole viewer sits in one screen. Phones: the drawn frame adds the status bar and
  rim (`PHONE_CHROME` of the width) to the capture's height.
*/
const DESK_RESERVED = "22rem";
const PHONE_RESERVED = "10rem";
const PHONE_MAX_PX = 380;
const PHONE_CHROME = 0.198;

function fitWidth(screen: Screen, phonesOnly: boolean): string {
  if (phonesOnly) {
    const ratio = screen.phone.width / (screen.phone.height + PHONE_CHROME * screen.phone.width);
    return `min(${PHONE_MAX_PX}px, calc((100vh - ${PHONE_RESERVED}) * ${ratio.toFixed(3)}))`;
  }
  const desk = screen.desk ?? screen.phone;
  return `calc((100vh - ${DESK_RESERVED}) * ${(desk.width / desk.height).toFixed(3)})`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function Arrow({ direction }: { direction: "previous" | "next" }) {
  const d = direction === "previous" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5";
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d={d} />
    </svg>
  );
}

const ARROW_BUTTON =
  "inline-flex h-10 w-10 cursor-pointer items-center justify-center border border-subtle bg-transparent text-steel transition-colors duration-fast ease-ui hover:border-text hover:text-text";

export function ScreenViewer({
  screens,
  labelledBy,
  lead,
}: {
  screens: readonly Screen[];
  labelledBy: string;
  /** Copy block placed above the list (phone-only layout). */
  lead?: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const count = screens.length;
  const phonesOnly = screens.every((screen) => !screen.desk);
  const go = (delta: number) => setIndex((current) => (current + delta + count) % count);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") go(1);
    if (event.key === "ArrowLeft") go(-1);
  };

  const controls = (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3">
      <p className="label-mono m-0 text-subtle">
        <span className="text-ember">{pad(index + 1)}</span>
        <span className="mx-2">/</span>
        {pad(count)}
      </p>
      <div className="flex gap-2">
        <button type="button" aria-label={site.work.viewer.previous} onClick={() => go(-1)} className={ARROW_BUTTON}>
          <Arrow direction="previous" />
        </button>
        <button type="button" aria-label={site.work.viewer.next} onClick={() => go(1)} className={ARROW_BUTTON}>
          <Arrow direction="next" />
        </button>
      </div>
    </div>
  );

  const list = (
    <ol
      aria-labelledby={labelledBy}
      className={`m-0 list-none p-0 ${phonesOnly ? "flex flex-col" : "grid grid-cols-1 sm:grid-cols-3"}`}
    >
      {screens.map((screen, i) => {
        const active = i === index;
        return (
          <li key={screen.label} className={phonesOnly ? "border-b border-border" : "border-b border-border sm:border-b-0 sm:border-r sm:last:border-r-0"}>
            <button
              type="button"
              aria-current={active ? "true" : undefined}
              onClick={() => setIndex(i)}
              className={`flex w-full cursor-pointer flex-col items-start gap-1.5 border-0 border-l-2 bg-transparent py-4 pl-4 pr-3 text-left transition-colors duration-fast ease-ui sm:pr-5 ${
                active ? "border-ember" : "border-transparent hover:border-subtle"
              }`}
            >
              <span className={`label-mono ${active ? "text-ember" : "text-muted"}`}>{screen.label}</span>
              <span className={`max-w-[38ch] text-caption leading-snug ${active ? "text-muted" : "text-subtle"}`}>{screen.note}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const frames = (
    <div
      className={`relative mx-auto ${phonesOnly ? "w-[78%] sm:w-[60%] lg:w-full" : "w-full"}`}
      style={{ maxWidth: fitWidth(screens[0], phonesOnly) }}
    >
      {screens.map((screen, i) => {
        const active = i === index;
        return (
          <div
            key={screen.label}
            aria-hidden={!active}
            className={`${i === 0 ? "relative" : "absolute inset-0"} transition-opacity duration-base ease-ui motion-reduce:transition-none ${
              active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {screen.desk && <BrowserFrame shot={screen.desk} sizes={DESK_SIZES} className="hidden sm:block" />}
            <PhoneFrame
              shot={screen.phone}
              sizes={phonesOnly ? PHONE_ROW_SIZES : PHONE_IN_DESK_SIZES}
              className={screen.desk ? "sm:hidden" : ""}
            />
          </div>
        );
      })}
    </div>
  );

  if (phonesOnly) {
    return (
      <div onKeyDown={onKeyDown} className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-x-12 lg:gap-y-10">
        {lead && <div className="lg:col-span-7">{lead}</div>}
        <div className="lg:col-span-5 lg:row-span-2 lg:self-center">
          {frames}
        </div>
        <div className="flex flex-col gap-2 lg:col-span-7">
          {controls}
          {list}
        </div>
      </div>
    );
  }

  return (
    <div onKeyDown={onKeyDown} className="flex flex-col gap-6">
      <div className="order-2 flex flex-col gap-2 sm:order-1">
        {controls}
        {list}
      </div>
      <div className="order-1 sm:order-2">
        {frames}
      </div>
    </div>
  );
}
