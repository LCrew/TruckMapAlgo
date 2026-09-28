import { eur, hours, num, PlanResult, Prediction } from "../lib/api";
import { Key, useI18n } from "../lib/i18n";

const COLORS: Record<string, string> = {
  fuel: "#f2a900",
  driver: "#1f6feb",
  tolls: "#8250df",
  wear: "#6e7781",
  fixed: "#2da44e",
  margin: "#bf3989",
};
const label = (k: string) => `c.${k}` as Key;

export default function CostBreakdown({ plan }: { plan: PlanResult }) {
  const { t } = useI18n();
  const method = (p: Prediction) => {
    const m = p.method.match(/^ml \((\d+) samples\)$/);
    return m ? t("methodMl", { n: m[1] }) : p.method === "cost-plus" ? t("methodCostPlus") : p.method;
  };
  const c = plan.cost;
  const parts = { ...c.components, margin: c.margin };
  const total = c.total || 1;
  const totalAlloc = plan.orders.reduce((a, o) => a + o.allocated_cost, 0);
  const totalStandalone = plan.orders.reduce((a, o) => a + o.standalone_cost, 0);
  const totalPred = plan.orders.reduce((a, o) => a + o.prediction.price, 0);

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="label">{t("kpiDistance")}</div><div className="value">{num(c.distance_km, 0)} km</div>
          <div className="sub">{Object.entries(c.km_by_country).map(([k, v]) => `${k} ${num(v, 0)}`).join(" · ")}</div></div>
        <div className="kpi"><div className="label">{t("kpiDriving")}</div><div className="value">{hours(c.drive_h)}</div>
          <div className="sub">{t("workDays", { w: hours(c.work_h), d: c.days, days: t(c.days > 1 ? "dayN" : "day1") })}</div></div>
        <div className="kpi"><div className="label">{t("fuel")}</div><div className="value">{num(c.fuel_litres, 0)} L</div>
          <div className="sub">{t("fuelSub", { p: c.fuel_price_pump.toFixed(3), n: c.fuel_price_net.toFixed(3) })}</div></div>
        <div className="kpi"><div className="label">{t("kpiUtil")}</div>
          <div className="value">{plan.allocation.utilization == null ? "—" : `${Math.round(plan.allocation.utilization * 100)}%`}</div>
          <div className="sub">{t("utilSub")}</div></div>
        <div className="kpi"><div className="label">{t("colRunCost")}</div><div className="value">{eur(c.total)}</div>
          <div className="sub">{t("perKm", { v: eur(c.total / Math.max(c.distance_km, 1)) })}</div></div>
        <div className="kpi"><div className="label">{t("kpiSaved")}</div><div className="value" style={{ color: "var(--good)" }}>
          {eur(totalStandalone - totalAlloc, 0)}</div><div className="sub">{t("ordersCombined", { n: plan.orders.length })}</div></div>
      </div>
      <div className="results-body">
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <h3>{t("runCostBreakdown")}</h3>
          <div className="bar">
            {Object.entries(parts).map(([k, v]) => (
              <span key={k} style={{ width: `${(v / total) * 100}%`, background: COLORS[k] }} title={`${t(label(k))} ${eur(v)}`} />
            ))}
          </div>
          {Object.entries(parts).map(([k, v]) => (
            <div className="legend-row" key={k}>
              <i style={{ background: COLORS[k] }} />
              <span>
                {t(label(k))}
                {k === "tolls" && Object.keys(c.tolls_by_country).length > 0 && (
                  <span className="muted small"> ({Object.entries(c.tolls_by_country).map(([cc, x]) => `${cc} ${eur(x, 0)}`).join(", ")})</span>
                )}
              </span>
              <span className="num">{eur(v)}</span>
            </div>
          ))}
          <div className="legend-row" style={{ fontWeight: 600, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
            <i /> <span>{t("total")}</span> <span className="num">{eur(c.total)}</span>
          </div>
          {plan.allocation.unused_capacity_cost > 0 && (
            <div className="legend-row"><i style={{ background: "#d0d7de" }} /><span>{t("unusedCap")}</span>
              <span className="num">{eur(plan.allocation.unused_capacity_cost)}</span></div>
          )}
        </div>
        <div>
          <h3 style={{ marginBottom: 6 }}>{t("pricePerOrder")}</h3>
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("order")}</th>
                  <th className="num">{t("colEffLdm")}</th>
                  <th className="num" title={t("colKmCountedTitle")}>{t("colKmCounted")}</th>
                  <th className="num">{t("colShare")}</th>
                  <th className="num">{t("colAllocated")}</th>
                  <th className="num">{t("colIfSolo")}</th>
                  <th className="num">{t("colSaving")}</th>
                  <th className="num">{t("colPredicted")}</th>
                </tr>
              </thead>
              <tbody>
                {plan.orders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <b>{o.reference || `#${o.id}`}</b> {o.hazmat && <span className="tag haz">ADR</span>}
                      <div className="muted small">{o.customer} → {o.delivery}</div>
                      {o.tent && <div className="small"><span className="tag">{o.tent}</span></div>}
                    </td>
                    <td className="num">{num(o.eff_ldm, 2)}</td>
                    <td className="num">{num(o.km_counted, 0)}
                      {o.km_on_board > o.km_counted + 1 && <div className="muted small">{t("kmOnBoard", { km: num(o.km_on_board, 0) })}</div>}</td>
                    <td className="num">{(o.share * 100).toFixed(1)}%</td>
                    <td className="num"><b>{eur(o.allocated_cost)}</b></td>
                    <td className="num">{eur(o.standalone_cost)}</td>
                    <td className="num" style={{ color: o.savings >= 0 ? "var(--good)" : "var(--bad)" }}>{eur(o.savings)}</td>
                    <td className="num">
                      {eur(o.prediction.price)}
                      <div className="muted small">
                        {o.prediction.low != null ? `${eur(o.prediction.low, 0)}–${eur(o.prediction.high, 0)} · ` : ""}
                        {method(o.prediction)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t("total")}</td><td /><td /><td className="num">100%</td>
                  <td className="num">{eur(totalAlloc)}</td>
                  <td className="num">{eur(totalStandalone)}</td>
                  <td className="num">{eur(totalStandalone - totalAlloc)}</td>
                  <td className="num">{eur(totalPred)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {t("shareExplain", { m3: num(plan.truck.volume_m3 / plan.truck.ldm_capacity, 2) })}
          </p>
        </div>
      </div>
    </>
  );
}
