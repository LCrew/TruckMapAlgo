import { eur, hours, num, PlanResult } from "../lib/api";
import { Key, useI18n } from "../lib/i18n";
import Icon from "./Icon";

export const COST_COLORS: Record<string, string> = {
  fuel: "#F07A22", driver: "#3C6FD8", tolls: "#8B5CF6", wear: "#8C8F94", fixed: "#2E9E6B", margin: "#D9468F",
};

/** KPI tiles + where the money goes + what each order should be charged. */
export default function CostBreakdown({ plan }: { plan: PlanResult }) {
  const { t } = useI18n();
  const c = plan.cost;
  const method = (p: string) => {
    const m = p.match(/^ml \((\d+) samples\)$/);
    if (m) return t("methodMl", { n: m[1] });
    return p === "cost-plus" ? t("methodCostPlus") : p;
  };
  const parts: Record<string, number> = { ...c.components, margin: c.margin };
  const totalAlloc = plan.orders.reduce((s, o) => s + o.allocated_cost, 0);
  const totalStandalone = plan.orders.reduce((s, o) => s + o.standalone_cost, 0);
  const totalPred = plan.orders.reduce((s, o) => s + o.prediction.price, 0);
  const saved = totalStandalone - totalAlloc;
  const countries = Object.entries(c.km_by_country).map(([k, v]) => `${k} ${num(v, 0)}`).join(" · ");
  const util = plan.allocation.utilization;

  const tiles = [
    { hero: true, label: t("colRunCost"), value: eur(c.total), sub: t("perKm", { v: eur(c.total / Math.max(c.distance_km, 1)) }) },
    { label: t("kpiDistance"), value: `${num(c.distance_km, 0)} km`, sub: countries },
    { label: t("kpiDriving"), value: hours(c.drive_h), sub: t("workDays", { w: hours(c.work_h), d: c.days, days: t(c.days === 1 ? "day1" : "dayN") }) },
    { label: t("fuel"), value: `${num(c.fuel_litres, 0)} L`, sub: t("fuelSub", { p: c.fuel_price_pump.toFixed(3), n: c.fuel_price_net.toFixed(3) }) },
    { label: t("kpiUtil"), value: util == null ? "—" : `${Math.round(util * 100)}%`, sub: t("utilSub") },
    { label: t("kpiSaved"), value: eur(saved, 0), sub: t("ordersCombined", { n: plan.orders.length }), good: saved > 0.5 },
  ];

  return (
    <>
      <div className="tiles">
        {tiles.map((x, i) => (
          <div key={x.label} className={`tile card ${x.hero ? "hero" : ""}`} style={{ "--i": i } as React.CSSProperties}>
            <span className="t-label">{x.label}</span>
            <span className={`t-value ${x.good ? "good-ink" : ""}`}>{x.value}</span>
            <span className="t-sub" title={x.sub}>{x.sub}</span>
          </div>
        ))}
      </div>

      <section className="stack">
        <h3 className="label">{t("runCostBreakdown")}</h3>
        <div className="card stack">
          <div className="stackbar" role="img" aria-label={t("runCostBreakdown")}>
            {Object.entries(parts).filter(([, v]) => v > 0).map(([k, v], i) => (
              <span key={k} title={`${t(`c.${k}` as Key)} ${eur(v)}`}
                style={{ width: `${(v / c.total) * 100}%`, background: COST_COLORS[k], "--i": i } as React.CSSProperties} />
            ))}
          </div>
          <div>
            {Object.entries(parts).map(([k, v]) => (
              <div key={k} className="legend-row">
                <i style={{ background: COST_COLORS[k] }} />
                <span>
                  {t(`c.${k}` as Key)}
                  {k === "tolls" && Object.keys(c.tolls_by_country).length > 0 && (
                    <span className="muted small"> · {Object.entries(c.tolls_by_country).map(([cc, x]) => `${cc} ${eur(x)}`).join(", ")}</span>
                  )}
                </span>
                <span className="num">{eur(v)}</span>
              </div>
            ))}
            <div className="legend-row total"><i /><span>{t("total")}</span><span className="num">{eur(c.total)}</span></div>
            {plan.allocation.unused_capacity_cost > 0 && (
              <div className="legend-row small muted"><i /><span>{t("unusedCap")}</span><span className="num">{eur(plan.allocation.unused_capacity_cost)}</span></div>
            )}
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="spread">
          <h3 className="label">{t("pricePerOrder")}</h3>
          <span className="small muted">{t("quoteTotal")} <b className="num" style={{ color: "var(--ink)" }}>{eur(totalPred, 0)}</b></span>
        </div>
        <div className="list">
          {plan.orders.map((o) => (
            <div key={o.id} className="card price-card">
              <div className="pc-top">
                <div className="stack tight" style={{ minWidth: 0 }}>
                  <span className="strong ellipsis">
                    {o.reference || `#${o.id}`} {o.hazmat && <span className="pill alert">ADR</span>}
                    <span className="muted" style={{ fontWeight: 400 }}> · {o.customer}</span>
                  </span>
                  <span className="small muted ellipsis" title={o.delivery}>{o.delivery}</span>
                </div>
                <div className="pc-price">
                  <span className="xsmall muted">{t("colPredicted")}</span>
                  <b>{eur(o.prediction.price, 0)}</b>
                  {o.prediction.low != null && o.prediction.high != null && (
                    <span className="xsmall faint num">{eur(o.prediction.low, 0)}–{eur(o.prediction.high, 0)}</span>
                  )}
                </div>
              </div>
              <div className="kv">
                <span>{t("colAllocated")} <b>{eur(o.allocated_cost)}</b></span>
                <span>{t("colIfSolo")} <b>{eur(o.standalone_cost)}</b></span>
                <span>{t("colSaving")} <b className={o.savings >= 0 ? "good-ink" : "bad-ink"}>{eur(o.savings)}</b></span>
                <span>{t("colShare")} <b>{num(o.share * 100, 1)}%</b></span>
                <span title={t("colKmCountedTitle")}>{t("colKmCounted")} <b>{num(o.km_counted, 0)}</b>
                  {o.km_on_board > o.km_counted + 1 && <> ({t("kmOnBoard", { km: num(o.km_on_board, 0) })})</>}
                </span>
                <span>{t("colEffLdm")} <b>{num(o.eff_ldm, 2)}</b></span>
                {o.tent && <span>{o.tent}</span>}
              </div>
              <span className="xsmall faint">{method(o.prediction.method)}</span>
            </div>
          ))}
        </div>
        <p className="small muted row" style={{ alignItems: "flex-start" }}>
          <Icon name="info" size={16} />
          <span>{t("shareExplain", { m3: num(plan.truck.volume_m3 / plan.truck.ldm_capacity, 2) })}</span>
        </p>
      </section>
    </>
  );
}
