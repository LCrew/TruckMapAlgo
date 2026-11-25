import { eur, FleetOption, hours, num, PlanResult } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { visitNumbers } from "../lib/route";
import CostBreakdown from "./CostBreakdown";
import Icon from "./Icon";
import LoadingPlanView from "./LoadingPlanView";
import { Spinner } from "./ui";

interface Props {
  plan: PlanResult;
  savedRunId: number | null;
  fleet: FleetOption[] | null;
  busy: string;
  stale: boolean;
  onSave: () => void;
  onClose: () => void;
  onUseTruck: (id: number) => void;
  onReplan: () => void;
  /** leg highlighted on the map, and a callback when a leg row is hovered here */
  hoverLeg?: number | null;
  onHoverLeg?: (i: number | null) => void;
}

export default function PlanResultPane({ plan, savedRunId, fleet, busy, stale, onSave, onClose, onUseTruck, onReplan, hoverLeg, onHoverLeg }: Props) {
  const { t } = useI18n();
  const visits = visitNumbers(plan.stops);
  const deliveries = plan.stops.filter((s) => s.kind === "delivery").length;
  const okFleet = fleet?.filter((f) => f.ok) ?? [];

  return (
    <aside className="float-pane result-pane" aria-label={t("routePlan")}>
      <div className="fp-head">
        <div className="res-title">
          <div className="stack" style={{ minWidth: 0 }}>
            <span className="label">{savedRunId ? t("runN", { id: savedRunId }) : t("routePlan")}</span>
            <h2 className="ellipsis">{plan.truck.label ?? plan.truck.name}</h2>
            <span className="small muted">
              {t("planSummary", { n: plan.orders.length, s: deliveries, km: num(plan.cost.distance_km, 0), d: hours(plan.cost.drive_h) })}
            </span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={t("closePlan")} title={t("closePlan")}><Icon name="x" /></button>
        </div>
        {savedRunId ? (
          <div className="alert ok"><Icon name="check" size={18} /><span>{t("savedAsRun", { id: savedRunId })}</span></div>
        ) : stale ? (
          <div className="row">
            <span className="small muted grow">{t("selectionChanged")}</span>
            <button className={`btn primary small ${busy === "plan" ? "busy" : ""}`} onClick={onReplan} disabled={!!busy}>{busy === "plan" && <Spinner />}{t("updatePlan")}</button>
          </div>
        ) : (
          <div className="row">
            <span className="small muted grow">{t("saveRunHint")}</span>
            <button className={`btn primary ${busy === "save" ? "busy" : ""}`} onClick={onSave} disabled={!!busy}>
              {busy === "save" ? <Spinner /> : <Icon name="save" size={18} />}{t("saveRun")}
            </button>
          </div>
        )}
      </div>

      <div className="fp-body">
        {plan.unserved.length > 0 && (
          <div className="alert error"><Icon name="alert" size={18} />
            <div className="stack tight">{plan.unserved.map((u) => <span key={u.id}>{t("orderNotPlanned", { id: u.id, reason: u.reason })}</span>)}</div>
          </div>
        )}
        {plan.warnings.length > 0 && (
          <div className="alert info"><Icon name="info" size={18} />
            <div className="stack tight">{plan.warnings.map((w, i) => <span key={i}>{w.text}</span>)}</div>
          </div>
        )}

        {fleet && fleet.length > 1 && (
          <details className="disclosure card">
            <summary>
              <span className="stack tight">
                <span className="strong">{t("fleetComparison")}</span>
                <span className="small muted">{t("fleetCompared", { n: okFleet.length, all: fleet.length })}</span>
              </span>
              <span className="fold-ic"><Icon name="chevron" size={18} /></span>
            </summary>
            <div className="list">
              {fleet.map((f) => {
                const current = f.truck_id === plan.truck.id;
                return (
                  <div key={f.truck_id} className={`fleet-row ${current ? "card on" : ""}`} style={current ? undefined : { background: "var(--tile)" }}>
                    <div className="stack tight" style={{ minWidth: 0 }}>
                      <span className="strong ellipsis">
                        {f.label} {f.recommended && <span className="pill ok">{t("cheapest")}</span>}
                      </span>
                      {f.ok ? (
                        <span className="xsmall muted num">
                          {f.served}/{f.served + f.unserved.length} {t("orders")} · {num(f.distance_km ?? 0, 0)} km · {hours(f.drive_h ?? 0)}
                          {f.trips && f.trips > 1 ? ` · ${f.trips} ${t("colTrips").toLowerCase()}` : ""}
                          {f.utilization != null ? ` · ${Math.round(f.utilization * 100)}%` : ""}
                          {f.split_orders ? ` · ${t("splitAcross", { n: f.split_orders })}` : ""}
                        </span>
                      ) : <span className="xsmall bad-ink">{f.error}</span>}
                      {f.ok && f.unserved.length > 0 && (
                        <span className="xsmall bad-ink">{t("cantTake", { ids: f.unserved.map((u) => `#${u.id}`).join(", ") })}</span>
                      )}
                    </div>
                    <div className="fr-cost">
                      <b>{f.total_cost != null ? eur(f.total_cost, 0) : "—"}</b>
                      <span className="xsmall muted">{f.extra_vs_best ? `+${eur(f.extra_vs_best, 0)}` : f.ok ? t("best") : ""}</span>
                    </div>
                    {current ? <span className="pill"><Icon name="check" size={13} stroke={2.4} />{t("inUse")}</span> : (
                      <button className="btn small" disabled={!f.ok || !!busy || !!savedRunId} onClick={() => onUseTruck(f.truck_id)}>{t("use")}</button>
                    )}
                  </div>
                );
              })}
            </div>
            <span className="xsmall faint">{t("rankedNote")}</span>
          </details>
        )}

        <CostBreakdown plan={plan} />
        {plan.loading && <LoadingPlanView loading={plan.loading} plan={plan} />}

        <details className="disclosure">
          <summary>
            <h3 className="label">{t("itinerary", { stops: plan.stops.length, legs: plan.legs.length })}</h3>
            <span className="fold-ic"><Icon name="chevron" size={18} /></span>
          </summary>
          <div className="timeline" onMouseLeave={() => onHoverLeg?.(null)}>
            {plan.stops.map((s, i) => {
              const li = plan.legs.findIndex((l) => l.from_seq === i);
              const leg = li >= 0 ? plan.legs[li] : undefined;
              return (
                <div key={i} className={`tl-stop ${li >= 0 && li === hoverLeg ? "hot" : ""}`}
                  onMouseEnter={leg ? () => onHoverLeg?.(li) : undefined} onMouseLeave={leg ? () => onHoverLeg?.(null) : undefined}>
                  <span className={`tl-dot ${s.kind}`}>{s.kind === "depot" || visits[i] === 0 ? <Icon name="home" size={14} /> : visits[i]}</span>
                  <div className="tl-body">
                    <span className="small">
                      <b>{t(s.kind === "pickup" ? "kindLoad" : s.kind === "delivery" ? "kindUnload" : "kindDepot")}</b>
                      {s.reference && <> · {s.reference}</>}
                    </span>
                    <span className="small muted">{s.label}</span>
                    {s.kind !== "depot" && (
                      <span className="tl-leg">{t("afterStop")} {num(s.load_kg_after / 1000, 2)} t · {num(s.load_ldm_after, 1)} LDM</span>
                    )}
                    {leg && (
                      <span className="tl-leg">
                        <span className="tl-legname">{t("legN", { n: li + 1 })}</span>↓ {num(leg.distance_km)} km · {hours(leg.duration_h)} · {num(leg.gross_t, 1)} t
                        {Object.keys(leg.km_by_country).length > 0 && ` · ${Object.entries(leg.km_by_country).map(([k, v]) => `${k} ${num(v, 0)}`).join(" ")}`}
                        {leg.restriction_detour_km != null && leg.restriction_detour_km > 1 && ` · ${t("forRestrictions", { km: num(leg.restriction_detour_km) })}`}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      </div>
    </aside>
  );
}
