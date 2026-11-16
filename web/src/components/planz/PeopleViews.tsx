"use client";

/* Drivers: the driver list, the pipeline board, and one driver's profile drawer. */

import { useEffect, useState } from "react";
import { planz, type Stage } from "@/content/planz";
import { type Driver, allSeats, balanceDue, depositDue, fmtDay, fmtMoney, fmtWeekend, isPast } from "./state";
import { Head, Owner, StatusPill, useDemo } from "./ui";
import s from "./shell.module.css";
import v from "./views.module.css";

const cd = planz.copy.drivers;
const cp = planz.copy.pipeline;
const cr = planz.copy.driver;
const stageLabel = (id: Stage) => planz.stages.find((x) => x.id === id)?.label ?? id;

function useNextRace(d: Driver): string {
  const { state, base } = useDemo();
  const ev = state.events.find((e) => !isPast(e) && allSeats(e).some((x) => x.driverId === d.id));
  return ev ? `${fmtWeekend(ev.start, base)} · ${ev.track}` : "";
}

function DriverRow({ d }: { d: Driver }) {
  const { openDriver } = useDemo();
  const next = useNextRace(d);
  return (
    <tr>
      <td>
        <button className={s.rowTitle} onClick={() => openDriver(d.id)}>{d.name}</button>
        <div className={s.rowSub}>{d.city}</div>
      </td>
      <td>{d.experience}</td>
      <td>{stageLabel(d.stage)}</td>
      <td><span className={s.rowSub}>{next}</span></td>
      <td><Owner name={d.owner} /></td>
      <td><span className={s.rowSub}>{d.source}</span></td>
    </tr>
  );
}

export function Drivers() {
  const { state } = useDemo();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = state.drivers.filter((d) => !needle || `${d.name} ${d.city} ${d.experience} ${d.interests}`.toLowerCase().includes(needle));
  return (
    <>
      <Head title={cd.title}>
        <input className={s.search} type="search" placeholder={cd.search} aria-label={cd.search} value={q} onChange={(e) => setQ(e.target.value)} />
      </Head>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              {Object.values(cd.cols).map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <DriverRow key={d.id} d={d} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Pipeline() {
  const { state, dispatch, openDriver } = useDemo();
  const ids = planz.stages.map((x) => x.id);
  return (
    <>
      <Head title={cp.title} sub={cp.sub} />
      <div className={v.board}>
        {planz.stages.map((stage, si) => {
          const cards = state.drivers.filter((d) => d.stage === stage.id);
          return (
            <section key={stage.id} className={v.col} aria-label={stage.label}>
              <div className={v.colHead}>
                <span>{stage.label}</span>
                <span>{cards.length}</span>
              </div>
              {cards.map((d) => (
                <article key={d.id} className={`${v.card} ${d.id === state.highlight ? v.cardNew : ""}`}>
                  <button className={s.rowTitle} onClick={() => openDriver(d.id)}>
                    {d.name}
                    {d.isNew && <span className={v.newFlag}>{cp.newFlag}</span>}
                  </button>
                  <div className={v.cardMeta}>
                    {d.experience}
                    <br />
                    {d.source}
                  </div>
                  <div className={v.cardFoot}>
                    <Owner name={d.owner} />
                    <span className={v.arrows}>
                      <button className={v.arrow} disabled={si === 0} aria-label={cp.back} onClick={() => dispatch({ type: "stage", driverId: d.id, stage: ids[si - 1] })}>
                        ←
                      </button>
                      <button className={v.arrow} disabled={si === ids.length - 1} aria-label={cp.forward} onClick={() => dispatch({ type: "stage", driverId: d.id, stage: ids[si + 1] })}>
                        →
                      </button>
                    </span>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}

export function DriverDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { state, dispatch, base } = useDemo();
  const d = state.drivers.find((x) => x.id === id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!d) return null;
  const races = state.events.flatMap((ev) =>
    ev.cars.flatMap((car) => ev.seats[car].filter((x) => x.driverId === d.id).map((seat) => ({ ev, car, seat })))
  );
  const initials = d.name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  const si = planz.stages.findIndex((x) => x.id === d.stage);
  const nextStage = planz.stages[si + 1];

  return (
    <>
      <button className={s.scrim} aria-label={cr.close} onClick={onClose} />
      <aside className={s.drawer} role="dialog" aria-modal="true" aria-label={d.name}>
        <div className={s.drawerHead}>
          <span className={s.avatar}>{initials}</span>
          <div>
            <div className={v.eventTitle}>{d.name}</div>
            <div className={s.rowSub}>
              {stageLabel(d.stage)} · {d.city}
            </div>
          </div>
          <button className={s.btn} onClick={onClose}>{cr.close}</button>
        </div>
        <div className={v.seatActions} style={{ justifyContent: "flex-start" }}>
          {nextStage && (
            <button className={`${s.btn} ${s.primary}`} onClick={() => dispatch({ type: "stage", driverId: d.id, stage: nextStage.id })}>
              {cr.advance} {nextStage.label}
            </button>
          )}
          <button className={s.btn} onClick={() => dispatch({ type: "call", driverId: d.id })}>{cr.logCall}</button>
        </div>

        <div className={s.section}>
          <h2 className={s.h2}>{cr.contact}</h2>
          <dl className={s.kv}>
            <dt>{cr.email}</dt>
            <dd>{d.email}</dd>
            <dt>{cr.phone}</dt>
            <dd>{d.phone}</dd>
            <dt>{cr.owner}</dt>
            <dd><Owner name={d.owner} /></dd>
            <dt>{cr.source}</dt>
            <dd>{d.source}</dd>
          </dl>
        </div>
        <div className={s.section}>
          <h2 className={s.h2}>{cr.experience}</h2>
          <p style={{ margin: 0 }}>{d.experience}</p>
        </div>
        <div className={s.section}>
          <h2 className={s.h2}>{cr.interests}</h2>
          <p style={{ margin: 0 }}>{d.interests || cr.none}</p>
          {d.notes && <p className={s.rowSub}>{d.notes}</p>}
        </div>
        <div className={s.section}>
          <h2 className={s.h2}>{cr.events}</h2>
          <ul className={s.list}>
            {races.map(({ ev, car, seat }) => (
              <li key={`${ev.id}${car}`} className={s.row}>
                <span className={s.rowMain}>
                  <span className={s.rowTitle}>{ev.track}</span>
                  <span className={s.rowSub}>
                    {fmtWeekend(ev.start, base)} · {planz.cars.find((c) => c.id === car)?.short}
                  </span>
                </span>
                <StatusPill status={seat.status} />
              </li>
            ))}
            {!races.length && <li className={s.row}>{cr.none}</li>}
          </ul>
        </div>
        {races.some(({ seat }) => ["committed", "deposit", "balance"].includes(seat.status)) && (
          <div className={s.section}>
            <h2 className={s.h2}>{cr.payments}</h2>
            <ul className={s.list}>
              {races
                .filter(({ seat }) => ["committed", "deposit", "balance"].includes(seat.status))
                .map(({ ev, car, seat }) => {
                  const dep = seat.status === "committed";
                  const due = dep ? depositDue(ev) : balanceDue(ev);
                  return (
                    <li key={`${ev.id}${car}p`} className={s.row}>
                      <span className={s.rowMain}>
                        <span className={s.rowTitle}>{dep ? planz.copy.event.depositDue : planz.copy.event.balanceDue}</span>
                        <span className={s.rowSub}>{ev.track}</span>
                      </span>
                      <span className={`${s.due} ${due < 0 ? s.overdue : ""}`}>
                        {fmtMoney(dep ? planz.pricing.deposit : planz.pricing.seat - planz.pricing.deposit)} · {fmtDay(due, base)}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
        <div className={s.section}>
          <h2 className={s.h2}>{cr.comms}</h2>
          {d.comms.map((m, i) => (
            <div key={i} className={s.comm}>
              <span className={s.commMeta}>{m.day === 0 ? planz.copy.common.today : fmtDay(m.day, base)}</span>
              <span>
                {m.text}
                <div className={s.commMeta}>
                  {m.channel} · {m.who}
                </div>
              </span>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
