import Link from "next/link";
import type { TodayFigures } from "@/lib/store/today";
import { countWord, money } from "./shared";

// Silver steps for stages, brightest = closest to closing. Color is not a meaning here, so no hues.
const STAGE_SHADES = ["#c6ccd3", "#7b838c", "#454c54"];

function Figure({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--color-border)] py-3.5">
      <p className="text-[14px] text-[var(--color-text-dim)]">{label}</p>
      <p className="tabular text-[30px] leading-[1.15] font-light tracking-[-0.03em] text-[var(--color-steel)]">{value}</p>
      {children}
    </div>
  );
}

// The rail's money: what's open by stage, what closed this quarter, and whether people write back.
export default function Pipeline({ figures }: { figures: TodayFigures }) {
  const { openTotal, stages, wonQuarter, replyRate } = figures;
  return (
    <section aria-labelledby="today-pipeline">
      <h2 id="today-pipeline" className="mb-3 flex items-baseline justify-between text-[17px] font-semibold text-[var(--color-text)]">
        Pipeline
        <Link href="/admin/deals" className="btn-quiet text-[14px] font-normal">
          Deals
        </Link>
      </h2>

      <Figure label="Open deals" value={money(openTotal)}>
        {stages.length > 0 ? (
          <>
            <div aria-hidden="true" className="mt-3 mb-2.5 flex h-2.5 gap-[3px]">
              {stages.map((s, i) => (
                <i key={s.stage} className="rounded-[2px]" style={{ flex: Math.max(s.total, 1), background: STAGE_SHADES[i] }} />
              ))}
            </div>
            <ul>
              {stages.map((s, i) => (
                <li key={s.stage} className="flex items-center gap-2.5 py-[3px] text-[14px] text-[var(--color-text-muted)]">
                  <i aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px]" style={{ background: STAGE_SHADES[i] }} />
                  {s.label}
                  <span className="text-[var(--color-text-dim)]">{s.count}</span>
                  <b className="tabular ml-auto font-normal text-[var(--color-text)]">{money(s.total)}</b>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-[14px] text-[var(--color-text-dim)]">No open deals right now.</p>
        )}
      </Figure>

      <Figure label={`Won this quarter (${wonQuarter.quarterLabel})`} value={money(wonQuarter.total)}>
        <p className="mt-1 text-[14px] text-[var(--color-text-dim)]">
          {wonQuarter.count === 0 ? "Nothing closed yet this quarter." : `${countWord(wonQuarter.count)} ${wonQuarter.count === 1 ? "deal" : "deals"} closed`}
        </p>
      </Figure>

      {replyRate && (
        // Below ten people a percentage overstates what is known, so show the plain count.
        <Figure label="Reply rate, last 30 days" value={replyRate.emailed >= 10 ? `${replyRate.pct}%` : `${replyRate.replied} of ${replyRate.emailed}`}>
          <p className="mt-1 text-[14px] text-[var(--color-text-dim)]">
            {replyRate.emailed >= 10
              ? `${replyRate.replied} of ${replyRate.emailed} people you emailed wrote back`
              : `${replyRate.emailed === 1 ? "person" : "people"} you emailed wrote back`}
          </p>
        </Figure>
      )}
    </section>
  );
}
