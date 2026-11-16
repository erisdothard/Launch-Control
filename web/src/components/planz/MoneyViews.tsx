"use client";

/* Payments (deposits and balances, with their deadlines) and the follow-up sequences. */

import { planz } from "@/content/planz";
import { fmtMoney, fmtWeekend, moneyTotals, payments } from "./state";
import { Kpi } from "./Dashboard";
import { Due, Head, StatusPill, useDemo } from "./ui";
import s from "./shell.module.css";

const cpay = planz.copy.payments;
const cf = planz.copy.followups;

export function Payments() {
  const { state, base, dispatch, openDriver } = useDemo();
  const rows = payments(state);
  const t = moneyTotals(state);
  return (
    <>
      <Head title={cpay.title} sub={cpay.sub}>
        <span className={s.badge}>{planz.pricing.note}</span>
      </Head>
      <div className={s.kpis} style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <Kpi value={fmtMoney(t.depositsOut)} label={cpay.totals.deposits} hot={t.depositsOut > 0} />
        <Kpi value={fmtMoney(t.balancesOut)} label={cpay.totals.balances} hot={t.balancesOut > 0} />
        <Kpi value={fmtMoney(t.collected)} label={cpay.totals.collected} />
      </div>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              {Object.values(cpay.cols).map((h) => (
                <th key={h}>{h}</th>
              ))}
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const action = r.status === "committed" ? { label: planz.copy.event.markDeposit, to: "deposit" as const } : r.status === "balance" ? { label: planz.copy.event.markPaid, to: "paid" as const } : null;
              return (
                <tr key={`${r.ev.id}${r.car}${r.idx}`}>
                  <td>
                    <button className={s.rowTitle} onClick={() => openDriver(r.driver.id)}>{r.driver.name}</button>
                  </td>
                  <td>
                    {r.ev.track}
                    <div className={s.rowSub}>{fmtWeekend(r.ev.start, base)}</div>
                  </td>
                  <td><StatusPill status={r.status} /></td>
                  <td>{r.amount ? fmtMoney(r.amount) : "—"}</td>
                  <td>{r.status === "paid" ? "—" : <Due day={r.due} />}</td>
                  <td>
                    {action && (
                      <button className={`${s.btn} ${s.primary}`} onClick={() => dispatch({ type: "seat", eventId: r.ev.id, car: r.car, idx: r.idx, status: action.to })}>
                        {action.label}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function FollowUps() {
  const { state, dispatch, openDriver } = useDemo();
  const byName = new Map<string, string>(planz.sequences.map((q) => [q.name, q.id]));
  const queue = state.followUps.filter((f) => state.sequencesOn[byName.get(f.sequence) ?? ""] !== false);
  return (
    <>
      <Head title={cf.title} sub={cf.sub} />
      <div className={`${s.grid} ${s.cols3}`}>
        <section className={s.panel}>
          <h2 className={s.h2}>{cf.queue}</h2>
          <ul className={s.list}>
            {queue.map((f) => {
              const d = state.drivers.find((x) => x.id === f.driverId);
              if (!d) return null;
              return (
                <li key={f.id} className={s.row}>
                  <span className={s.rowMain}>
                    <button className={s.rowTitle} onClick={() => openDriver(d.id)}>{d.name}</button>
                    <span className={s.rowSub}>
                      {f.sequence} · {f.step}
                    </span>
                  </span>
                  {f.state === "queued" ? (
                    <>
                      <Due day={f.day} />
                      <button className={s.btn} onClick={() => dispatch({ type: "followUp", id: f.id, state: "skipped" })}>{cf.skip}</button>
                      <button className={`${s.btn} ${s.primary}`} onClick={() => dispatch({ type: "followUp", id: f.id, state: "sent" })}>{cf.send}</button>
                    </>
                  ) : (
                    <span className={s.due}>{f.state === "sent" ? cf.sent : cf.skip}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className={s.panel}>
          <h2 className={s.h2}>{cf.sequences}</h2>
          <ul className={s.list}>
            {planz.sequences.map((q) => {
              const on = state.sequencesOn[q.id] !== false;
              return (
                <li key={q.id} className={s.row} style={{ alignItems: "flex-start" }}>
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>{q.name}</span>
                    <span className={s.rowSub}>
                      {cf.trigger}: {q.trigger}
                    </span>
                    <ol className={s.steps}>
                      {q.steps.map((st) => (
                        <li key={st}>{st}</li>
                      ))}
                    </ol>
                  </span>
                  <button className={`${s.toggle} ${on ? s.toggleOn : ""}`} aria-pressed={on} onClick={() => dispatch({ type: "sequence", id: q.id, on: !on })}>
                    {on ? cf.on : cf.off}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}
