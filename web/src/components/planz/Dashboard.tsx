"use client";

import { planz } from "@/content/planz";
import { allSeats, fmtDay, fmtMoney, fmtWeekend, isPast, moneyTotals, needsAttention, payments, seatCounts } from "./state";
import { Due, MiniSeats, SeatBar, useDemo } from "./ui";
import s from "./shell.module.css";
import v from "./views.module.css";

const c = planz.copy.dashboard;

export function Dashboard() {
  const { state, base, go, openDriver } = useDemo();
  const upcoming = state.events.filter((e) => !isPast(e));
  const next = upcoming[0];
  const totals = upcoming.reduce(
    (t, e) => {
      const n = seatCounts(e);
      return { total: t.total + n.total, committed: t.committed + n.committed, open: t.open + n.open };
    },
    { total: 0, committed: 0, open: 0 }
  );
  const money = moneyTotals(state);
  const attention = needsAttention(state);
  const deadlines = payments(state).filter((r) => r.status === "committed" || r.status === "balance").slice(0, 6);
  const maxDrivers = state.drivers.filter((d) => d.owner === planz.brand.bizdev);
  const maxSeated = maxDrivers.filter((d) => d.stage === "confirmed").length;
  const maxQualified = maxDrivers.filter((d) => ["qualified", "approved", "pending"].includes(d.stage)).length;
  const maxNew = maxDrivers.filter((d) => ["inquiry", "contacted"].includes(d.stage)).length;

  return (
    <>
      <section className={s.hero}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static demo image, exact crop */}
        <img src={planz.brand.hero} alt={planz.brand.heroAlt} width={1200} height={799} />
        <div className={s.heroBody}>
          <span className={s.stripe} />
          <h1 className={s.h1}>{planz.copy.intro.title}</h1>
          <p>{planz.copy.intro.body}</p>
        </div>
      </section>

      <div className={s.kpis}>
        <Kpi value={String(upcoming.length)} label={c.kpis.events} />
        <Kpi value={`${totals.committed}/${totals.total}`} label={c.kpis.filled} />
        <Kpi value={String(totals.open)} label={c.kpis.open} />
        <Kpi value={fmtMoney(money.depositsOut)} label={`${c.kpis.deposits} (${money.depositsOutCount})`} hot={money.depositsOut > 0} />
        <Kpi value={String(attention.length)} label={c.kpis.attention} hot={attention.length > 0} />
      </div>

      <div className={`${s.grid} ${s.cols3}`}>
        {next && (
          <section className={s.panel}>
            <h2 className={s.h2}>{c.nextRace}</h2>
            <div className={v.eventHead}>
              <div>
                <div className={v.eventTitle}>{next.track}</div>
                <div className={v.eventMeta}>
                  {fmtWeekend(next.start, base)} · {next.city} · {next.series}
                </div>
              </div>
              <button className={`${s.btn} ${s.primary}`} onClick={() => go("event", next.id)}>
                {c.viewEvent}
              </button>
            </div>
            <MiniSeats ev={next} />
            <ul className={s.list} style={{ marginTop: 12 }}>
              {next.cars.flatMap((car) =>
                next.seats[car].map((seat, i) => {
                  const d = state.drivers.find((x) => x.id === seat.driverId);
                  return (
                    <li key={`${car}${i}`} className={s.row}>
                      <span className={s.rowMain}>
                        {d ? (
                          <button className={s.rowTitle} onClick={() => openDriver(d.id)}>{d.name}</button>
                        ) : (
                          <span className={v.seatEmpty}>{planz.copy.event.empty}</span>
                        )}
                        <span className={s.rowSub}>{planz.cars.find((x) => x.id === car)?.short}</span>
                      </span>
                      <span className={s.due}>{planz.seatStatus[seat.status].short}</span>
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        )}

        <section className={s.panel}>
          <h2 className={s.h2}>{c.needsFollowUp}</h2>
          <ul className={s.list}>
            {attention.slice(0, 8).map((a, i) => (
              <li key={`${a.driver.id}${i}`} className={s.row}>
                <span className={s.rowMain}>
                  <button className={s.rowTitle} onClick={() => openDriver(a.driver.id)}>{a.driver.name}</button>
                  <span className={s.rowSub}>{a.reason}</span>
                </span>
                <Due day={a.day} />
              </li>
            ))}
            {!attention.length && <li className={s.row}>{c.none}</li>}
          </ul>
        </section>
      </div>

      <div className={`${s.grid} ${s.cols2}`}>
        <section className={s.panel}>
          <h2 className={s.h2}>{c.deadlines}</h2>
          <ul className={s.list}>
            {deadlines.map((r) => (
              <li key={`${r.ev.id}${r.car}${r.idx}`} className={s.row}>
                <span className={s.rowMain}>
                  <button className={s.rowTitle} onClick={() => openDriver(r.driver.id)}>{r.driver.name}</button>
                  <span className={s.rowSub}>
                    {planz.seatStatus[r.status].short} · {fmtMoney(r.amount)} · {r.ev.track}
                  </span>
                </span>
                <Due day={r.due} />
              </li>
            ))}
            {!deadlines.length && <li className={s.row}>{c.none}</li>}
          </ul>
        </section>

        <section className={s.panel}>
          <h2 className={s.h2}>{c.fromMax}</h2>
          <div className={s.kpis} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginBottom: 12 }}>
            <Kpi value={String(maxNew)} label={planz.stages[0].label} />
            <Kpi value={String(maxQualified)} label={planz.stages[2].label} />
            <Kpi value={String(maxSeated)} label={planz.stages[5].label} />
          </div>
          <ul className={s.list}>
            {maxDrivers
              .flatMap((d) => d.comms.filter((m) => m.who === planz.brand.bizdev).slice(0, 1).map((m) => ({ d, m })))
              .sort((a, b) => b.m.day - a.m.day)
              .slice(0, 5)
              .map(({ d, m }) => (
                <li key={d.id} className={s.row}>
                  <span className={s.rowMain}>
                    <button className={s.rowTitle} onClick={() => openDriver(d.id)}>{d.name}</button>
                    <span className={s.rowSub}>{m.text}</span>
                  </span>
                  <span className={s.due}>{fmtDay(m.day, base)}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>

      <section className={s.panel}>
        <h2 className={s.h2}>{c.season}</h2>
        <div className={v.season}>
          {upcoming.slice(0, 8).map((ev) => {
            const n = seatCounts(ev);
            return (
              <button key={ev.id} className={v.raceCard} onClick={() => go("event", ev.id)}>
                <span className={v.raceTop}>
                  <span className={v.raceDate}>{fmtWeekend(ev.start, base)}</span>
                  <span>{ev.series}</span>
                </span>
                <span className={v.raceTrack}>{ev.track}</span>
                <SeatBar ev={ev} />
                <span className={v.raceFoot}>
                  <span>
                    {n.committed}/{allSeats(ev).length} {planz.copy.calendar.seats}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Kpi({ value, label, hot = false }: { value: string; label: string; hot?: boolean }) {
  return (
    <div className={`${s.kpi} ${hot ? s.kpiHot : ""}`}>
      <div className={s.kpiValue}>{value}</div>
      <div className={s.kpiLabel}>{label}</div>
    </div>
  );
}

export { Kpi };
