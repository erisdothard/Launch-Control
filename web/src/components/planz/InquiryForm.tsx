"use client";

/* The Plan Z-branded seat inquiry form, fields as on planzracing.com/contact plus a race weekend
   picker fed by the calendar. Sending it puts the driver into the pipeline in this demo. */

import { useState, type FormEvent } from "react";
import { planz } from "@/content/planz";
import { fmtWeekend, isPast, seatCounts } from "./state";
import { useDemo } from "./ui";
import s from "./shell.module.css";
import v from "./views.module.css";

const cf = planz.copy.form;
const f = cf.fields;

export function InquiryForm() {
  const { state, base, dispatch, go } = useDemo();
  const [sent, setSent] = useState(false);
  const upcoming = state.events.filter((e) => !isPast(e));

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const val = (k: string) => String(data.get(k) ?? "").trim();
    dispatch({
      type: "inquiry",
      id: `new${Date.now()}`,
      input: { name: val("name"), email: val("email"), phone: val("phone"), experience: val("experience"), car: val("car"), series: val("series"), eventId: val("event"), message: val("message") },
    });
    setSent(true);
  }

  return (
    <div className={v.formFrame}>
      <div className={v.formBar}>
        <i />
        <i />
        <i />
        <span>{cf.frame}</span>
      </div>
      <div className={v.formBody}>
        <div className={v.formLogo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static logo */}
          <img src={planz.brand.logo} alt={planz.brand.name} width={60} height={60} />
          <div>
            <h1 className={v.formTitle}>{cf.title}</h1>
            <p className={s.sub}>{cf.sub}</p>
          </div>
        </div>
        {sent ? (
          <div className={v.thanks} role="status">
            <h2>{cf.thanks}</h2>
            <p className={s.sub}>{cf.thanksBody}</p>
            <div className={v.actionsRow}>
              <button className={`${s.btn} ${s.primary}`} onClick={() => go("pipeline")}>{cf.seeIt}</button>
              <button className={s.btn} onClick={() => setSent(false)}>{cf.another}</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className={v.fields}>
              <Field id="name" label={f.name} required />
              <Field id="email" label={f.email} type="email" required />
              <Field id="phone" label={f.phone} type="tel" />
              <Field id="video" label={f.video} type="url" />
              <div className={`${v.field} ${v.fieldWide}`}>
                <label htmlFor="pz-experience">
                  {f.experience} <span className={v.req}>*</span>
                </label>
                <span className={v.hint}>{f.experienceHint}</span>
                <textarea id="pz-experience" name="experience" className={v.input} rows={3} required />
              </div>
              <div className={`${v.field} ${v.fieldWide}`}>
                <label htmlFor="pz-event">{f.event}</label>
                <select id="pz-event" name="event" className={v.input} defaultValue={upcoming[1]?.id}>
                  {upcoming.map((e) => {
                    const n = seatCounts(e);
                    const left = n.total - n.committed - n.interested;
                    return (
                      <option key={e.id} value={e.id}>
                        {fmtWeekend(e.start, base)} · {e.track} ({left > 0 ? `${left} ${cf.seatsLeft}` : cf.full})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className={v.field}>
                <label htmlFor="pz-car">{f.car}</label>
                <select id="pz-car" name="car" className={v.input}>
                  <option value="">{cf.noPref}</option>
                  {planz.cars.map((c) => (
                    <option key={c.id} value={c.short}>{`${c.name} (${c.trans})`}</option>
                  ))}
                </select>
              </div>
              <div className={v.field}>
                <label htmlFor="pz-series">{f.series}</label>
                <select id="pz-series" name="series" className={v.input}>
                  <option value="">{cf.notSure}</option>
                  {cf.seriesOptions.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div className={v.field}>
                <label htmlFor="pz-shirt">{f.shirt}</label>
                <select id="pz-shirt" name="shirt" className={v.input}>
                  <option>{cf.shirtNo}</option>
                  <option>{cf.shirtYes}</option>
                </select>
              </div>
              <div className={`${v.field} ${v.fieldWide}`}>
                <label htmlFor="pz-message">{f.message}</label>
                <textarea id="pz-message" name="message" className={v.input} rows={3} />
              </div>
            </div>
            <button type="submit" className={v.submit}>{cf.submit}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, type = "text", required = false }: { id: string; label: string; type?: string; required?: boolean }) {
  return (
    <div className={v.field}>
      <label htmlFor={`pz-${id}`}>
        {label} {required && <span className={v.req}>*</span>}
      </label>
      <input id={`pz-${id}`} name={id} type={type} className={v.input} required={required} />
    </div>
  );
}
