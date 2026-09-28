import { num, PlanResult } from "../lib/api";
import { useI18n } from "../lib/i18n";

const COLORS = ["#1f6feb", "#f2a900", "#2da44e", "#8250df", "#bf3989", "#d1242f", "#0a7ea4", "#6e7781"];

/** Which tent each order travels in, and how full each tent gets at its busiest point. */
export default function LoadingPlanView({ plan }: { plan: PlanResult }) {
  const { t } = useI18n();
  const lp = plan.loading!;
  const ref = (id: number) => plan.orders.find((o) => o.id === id)?.reference || `#${id}`;
  const color = (id: number) => COLORS[plan.orders.findIndex((o) => o.id === id) % COLORS.length];
  return (
    <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", display: "grid", gap: 10 }}>
      <h3>{t("loadingPlan", { tents: t(lp.compartments.length > 1 ? "tentN" : "tent1", { n: lp.compartments.length }) })}</h3>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`, gap: 12 }}>
        {lp.compartments.map((c) => (
          <div key={c.name} className="card" style={{ padding: 12, gap: 8 }}>
            <div className="spread"><b>{c.name}</b><span className="small muted">{c.ldm} LDM · {c.volume_m3} m³ · {c.max_payload_t} t</span></div>
            {[
              [t("loadingM"), c.peak_ldm, c.ldm],
              [t("volume"), c.peak_volume_m3, c.volume_m3],
              [t("weight"), c.peak_weight_t, c.max_payload_t],
            ].map(([label, used, cap]) => (
              <div key={label as string} style={{ display: "grid", gridTemplateColumns: "70px 1fr 90px", gap: 8, alignItems: "center" }}>
                <span className="small muted">{label}</span>
                <div className="bar"><span style={{ width: `${Math.min(100, ((used as number) / ((cap as number) || 1)) * 100)}%`,
                  background: (used as number) > (cap as number) + 1e-6 ? "var(--bad)" : "var(--route)" }} /></div>
                <span className="small mono num">{num(used as number, 1)} / {num(cap as number, 1)}</span>
              </div>
            ))}
            <div className="row">
              {c.orders.length === 0 && <span className="small muted">{t("empty")}</span>}
              {c.orders.map((o) => (
                <span key={o.order_id} className="tag" style={{ borderColor: color(o.order_id) }}>
                  <i style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color(o.order_id), marginRight: 4 }} />
                  {ref(o.order_id)}{o.fraction < 0.999 ? ` (${Math.round(o.fraction * 100)}%)` : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="muted small">{t("peaksNote")}</div>
    </div>
  );
}
