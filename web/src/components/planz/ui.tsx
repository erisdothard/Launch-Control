"use client";

/* Shared bits of the Plan Z demo: the context every view reads, and the small parts they share. */

import { createContext, useContext, type CSSProperties, type Dispatch } from "react";
import { planz, type SeatStatus } from "@/content/planz";
import { type Action, type DemoState, type RaceEvent, allSeats, carById, fmtDay } from "./state";
import s from "./shell.module.css";
import v from "./views.module.css";

export type View = keyof typeof planz.copy.nav;

export interface DemoCtx {
  state: DemoState;
  dispatch: Dispatch<Action>;
  base: Date;
  go: (view: View, eventId?: string) => void;
  openDriver: (id: string) => void;
  eventId: string;
}

export const Ctx = createContext<DemoCtx | null>(null);

export function useDemo(): DemoCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Plan Z demo context missing");
  return ctx;
}

export const STATUS_COLOR: Record<SeatStatus, string> = {
  open: "var(--s-open)",
  interested: "var(--s-interested)",
  committed: "var(--s-committed)",
  deposit: "var(--s-deposit)",
  balance: "var(--s-balance)",
  paid: "var(--s-paid)",
};

export function StatusPill({ status, long = false }: { status: SeatStatus; long?: boolean }) {
  const label = planz.seatStatus[status];
  return (
    <span className={s.pill} style={{ "--c": STATUS_COLOR[status] } as CSSProperties}>
      {long ? label.label : label.short}
    </span>
  );
}

export function CarDot({ car }: { car: string }) {
  return <span className={v.carDot} style={{ background: carById(car)?.color }} aria-hidden />;
}

export function MiniSeats({ ev }: { ev: RaceEvent }) {
  return (
    <span className={v.mini} aria-hidden>
      {ev.cars.map((car, ci) => (
        <span key={car} className={v.mini}>
          {ci > 0 && <span className={v.miniGap} />}
          {ev.seats[car].map((seat, i) => (
            <span key={i} className={v.miniSeat} style={{ background: STATUS_COLOR[seat.status] }} />
          ))}
        </span>
      ))}
    </span>
  );
}

export function SeatBar({ ev }: { ev: RaceEvent }) {
  const seats = allSeats(ev);
  const order: SeatStatus[] = ["paid", "balance", "deposit", "committed", "interested"];
  return (
    <span className={v.bar} aria-hidden>
      {order.map((st) => {
        const n = seats.filter((x) => x.status === st).length;
        return n ? <span key={st} style={{ width: `${(n / seats.length) * 100}%`, background: STATUS_COLOR[st] }} /> : null;
      })}
    </span>
  );
}

export function Owner({ name }: { name: string }) {
  return <span className={`${v.owner} ${name === planz.brand.bizdev ? v.ownerMax : ""}`}>{name}</span>;
}

export function Due({ day }: { day: number }) {
  const { base } = useDemo();
  const { common } = planz.copy;
  const label = day === 0 ? common.today : fmtDay(day, base);
  return <span className={`${s.due} ${day < 0 ? s.overdue : ""}`}>{day < 0 ? `${label} · ${common.overdue}` : label}</span>;
}

export function Legend() {
  return (
    <div className={s.legend}>
      {(Object.keys(planz.seatStatus) as SeatStatus[]).map((st) => (
        <StatusPill key={st} status={st} />
      ))}
    </div>
  );
}

export function Head({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className={s.head}>
      <div>
        <h1 className={s.h1}>{title}</h1>
        {sub && <p className={s.sub}>{sub}</p>}
      </div>
      {children}
    </div>
  );
}
