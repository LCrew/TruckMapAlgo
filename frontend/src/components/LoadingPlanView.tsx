import { LoadingPlan, num, PlanResult } from "../lib/api";
import { useI18n } from "../lib/i18n";

const COLORS = ["#3C6FD8", "#F07A22", "#2E9E6B", "#8B5CF6", "#D9468F", "#C8321E", "#0A7EA4", "#8C8F94"];

/** How the orders are split across the tents, with how full each tent gets at its peak. */
export default function LoadingPlanView({ loading, plan }: { loading: LoadingPlan; plan: PlanResult }) {
  const { t } = useI18n();
  const color = (id: number) => COLORS[Math.max(0, plan.orders.findIndex((o) => o.id === id)) % COLORS.length];
  const ref = (id: number) => {
    const o = plan.orders.find((x) => x.id === id);
    return o?.reference || `#${id}`;
  };
  const n = loading.compartments.length;
  return (
    <section className="stack">
      <h3 className="label">{t("loadingPlan", { tents: t(n > 1 ? "tentN" : "tent1", { n }) })}</h3>
      <div className={n > 1 ? "grid2" : "list"}>
        {loading.compartments.map((c, i) => {
          const bars: [string, number, number, string][] = [
            [t("loadingM"), c.peak_ldm, c.ldm, "LDM"],
            [t("volume"), c.peak_volume_m3, c.volume_m3, "m³"],
            [t("weight"), c.peak_weight_t, c.max_payload_t, "t"],
          ];
          return (
            <div key={i} className="card stack">
              <div className="stack tight">
                <span className="strong">{c.name}</span>
                <span className="xsmall muted num">{c.ldm} LDM · {c.volume_m3} m³ · {c.max_payload_t} t</span>
              </div>
              <div className="stack tight">
                {bars.map(([label, v, cap, unit]) => {
                  const f = cap > 0 ? v / cap : 0;
                  return (
                    <div key={label} className="meter-row">
                      <span className="muted">{label}</span>
                      <div className={`meter ${f > 1.001 ? "over" : "route"}`}><span style={{ width: `${Math.min(100, f * 100)}%` }} /></div>
                      <span className={`num xsmall ${f > 1.001 ? "bad-ink" : ""}`}>{num(v, 1)}/{num(cap, 1)} {unit}</span>
                    </div>
                  );
                })}
              </div>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {c.orders.length ? c.orders.map((o) => (
                  <span key={o.order_id} className="pill" style={{ background: `color-mix(in srgb, ${color(o.order_id)} 16%, transparent)`, color: "var(--ink)" }}>
                    <span className="dot" style={{ background: color(o.order_id) }} />
                    {ref(o.order_id)}{o.fraction < 0.999 && ` (${Math.round(o.fraction * 100)}%)`}
                  </span>
                )) : <span className="small faint">{t("empty")}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <p className="xsmall faint">{t("peaksNote")}</p>
    </section>
  );
}
