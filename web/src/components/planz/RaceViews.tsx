"use client";

/* The season calendar and one race weekend's seat map, with the seat actions Jim and Max use. */

import { planz, type SeatStatus } from "@/content/planz";
import { type RaceEvent, type Seat, allSeats, balanceDue, carById, depositDue, fmtMoney, fmtWeekend, isPast, seatCounts } from "./state";
import { CarDot, Due, Head, Legend, SeatBar, StatusPill, useDemo } from "./ui";
import s from "./shell.module.css";
import v from "./views.module.css";

const cc = planz.copy.calendar;
const ce = planz.copy.event;

export function Calendar() {
  const { state, base, go } = useDemo();
  return (
    <>
      <Head title={cc.title} sub={cc.sub}>
        <Legend />
      </Head>
      <div className={v.season}>
        {state.events.map((ev) => {
          const n = seatCounts(ev);
          const past = isPast(ev);
          return (
            <button key={ev.id} className={`${v.raceCard} ${past ? v.racePast : ""}`} onClick={() => go("event", ev.id)}>
              <span className={v.raceTop}>
                <span className={v.raceDate}>{fmtWeekend(ev.start, base)}</span>
                <span>{past ? cc.past : ev.series}</span>
              </span>
              <span className={v.raceTrack}>{ev.track}</span>
              <span className={s.rowSub}>{ev.city}</span>
              <SeatBar ev={ev} />
              <span className={v.raceFoot}>
                <span>
                  {n.committed}/{n.total} {cc.seats}
                </span>
                <span>
                  {ev.cars.map((c) => (
                    <CarDot key={c} car={c} />
                  ))}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function EventView() {
  const { state, base, go, eventId } = useDemo();
  const ev = state.events.find((e) => e.id === eventId) ?? state.events.find((e) => !isPast(e)) ?? state.events[0];
  const n = seatCounts(ev);
  const backup = carById(ev.backup);
  const waitlist = ev.waitlist.map((id) => state.drivers.find((d) => d.id === id)).filter((d) => d !== undefined);

  return (
    <>
      <Head title={ce.title}>
        <select className={s.select} value={ev.id} onChange={(e) => go("event", e.target.value)} aria-label={ce.choose}>
          {state.events.map((e) => (
            <option key={e.id} value={e.id}>
              {fmtWeekend(e.start, base)} · {e.track}
            </option>
          ))}
        </select>
      </Head>
      <div className={v.eventHead}>
        <div>
          <div className={v.eventTitle}>{ev.track}</div>
          <div className={v.eventMeta}>
            {fmtWeekend(ev.start, base)} · {ev.city} · {ev.series}
          </div>
        </div>
        <Legend />
      </div>
      <div className={v.facts}>
        <span>
          <strong>{n.committed}/{n.total}</strong> {cc.seats}
        </span>
        <span>
          {ce.depositDue}: <Due day={depositDue(ev)} />
        </span>
        <span>
          {ce.balanceDue}: <Due day={balanceDue(ev)} />
        </span>
        <span>
          {fmtMoney(planz.pricing.seat)} / {fmtMoney(planz.pricing.deposit)} · {planz.pricing.note}
        </span>
        {backup && (
          <span>
            {cc.backup}: <strong>{backup.short}</strong>
          </span>
        )}
      </div>
      <div className={v.cars}>
        {ev.cars.map((car) => {
          const info = carById(car);
          return (
            <section key={car} className={v.car}>
              <div className={v.carHead}>
                <CarDot car={car} />
                <span className={v.carName}>{info?.name}</span>
                <span className={v.carMeta}>{info?.trans}</span>
              </div>
              {ev.seats[car].map((seat, idx) => (
                <SeatRow key={idx} ev={ev} car={car} idx={idx} seat={seat} />
              ))}
            </section>
          );
        })}
      </div>
      <p className={s.sub} style={{ marginTop: 12 }}>{ce.stint}</p>
      {waitlist.length > 0 && (
        <section className={s.panel} style={{ marginTop: 16 }}>
          <h2 className={s.h2}>{ce.waitlist}</h2>
          <ul className={s.list}>
            {waitlist.map((d) => (
              <li key={d.id} className={s.row}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{d.name}</span>
                  <span className={s.rowSub}>{d.experience}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const NEXT: Partial<Record<SeatStatus, { label: string; to: SeatStatus }>> = {
  interested: { label: ce.commit, to: "committed" },
  committed: { label: ce.markDeposit, to: "deposit" },
  balance: { label: ce.markPaid, to: "paid" },
};

function SeatRow({ ev, car, idx, seat }: { ev: RaceEvent; car: string; idx: number; seat: Seat }) {
  const { state, dispatch, openDriver } = useDemo();
  const driver = state.drivers.find((d) => d.id === seat.driverId);
  const inEvent = new Set(allSeats(ev).map((x) => x.driverId));
  const candidates = state.drivers.filter((d) => !inEvent.has(d.id) && ["qualified", "approved", "pending", "confirmed"].includes(d.stage));
  const next = NEXT[seat.status];
  const canRemind = ["interested", "committed", "balance"].includes(seat.status);
  const set = (status: SeatStatus, driverId?: string | null) => dispatch({ type: "seat", eventId: ev.id, car, idx, status, driverId });

  return (
    <div className={v.seat}>
      <span className={v.seatNo}>{idx + 1}</span>
      <div className={v.seatWho}>
        {driver ? (
          <button className={s.rowTitle} onClick={() => openDriver(driver.id)}>{driver.name}</button>
        ) : (
          <span className={v.seatEmpty}>{ce.empty}</span>
        )}
        <div className={v.seatSub}>
          <StatusPill status={seat.status} long />
          {driver && <span>{driver.experience}</span>}
        </div>
      </div>
      <div className={v.seatActions}>
        {!driver && (
          <select className={s.select} value="" onChange={(e) => e.target.value && set("interested", e.target.value)} aria-label={ce.assign}>
            <option value="">{ce.pickDriver}</option>
            {candidates.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
        {driver && canRemind && (
          <button className={s.btn} disabled={seat.reminded} onClick={() => dispatch({ type: "remind", eventId: ev.id, car, idx })}>
            {seat.reminded ? ce.reminded : ce.remind}
          </button>
        )}
        {driver && next && (
          <button className={`${s.btn} ${s.primary}`} onClick={() => set(next.to)}>{next.label}</button>
        )}
        {driver && seat.status === "interested" && (
          <button className={s.btn} onClick={() => set("open", null)}>{ce.release}</button>
        )}
      </div>
    </div>
  );
}
