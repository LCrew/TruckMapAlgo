import { useEffect, useMemo, useState } from "react";
import AddressInput from "../components/AddressInput";
import CostBreakdown from "../components/CostBreakdown";
import MapView from "../components/MapView";
import LoadingPlanView from "../components/LoadingPlanView";
import { api, eur, FleetOption, hours, num, Order, PlanResult, Settings, tentsOf, Truck, truckLabel } from "../lib/api";
import { useI18n } from "../lib/i18n";

const EMPTY_ORDER: Partial<Order> = {
  reference: "", customer: "", pickup_address: null, pickup_lat: null, pickup_lon: null,
  delivery_address: "", delivery_lat: null, delivery_lon: null,
  ldm: 0, volume_m3: 0, weight_kg: 0, pallets: 0, hazmat: false, notes: "",
};

type PickTarget = "delivery" | "pickup" | null;

export default function Planner({ settings }: { settings: Settings | null }) {
  const { t, lang } = useI18n();
  const tr = t;
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [truckId, setTruckId] = useState<number | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Partial<Order> | null>(null);
  const [pick, setPick] = useState<PickTarget>(null);
  const [runs, setRuns] = useState<{ id: number; name: string; created_at: string; total_cost: number; total_km: number }[]>([]);
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const [fleet, setFleet] = useState<FleetOption[] | null>(null);
  const [comparing, setComparing] = useState(false);

  const loadOrders = () => api.orders("open").then(setOrders);
  const loadRuns = () => api.runs().then(setRuns);

  useEffect(() => {
    api.trucks().then((t) => {
      setTrucks(t);
      const first = t.find((x) => x.active) ?? t[0];
      if (first) setTruckId(first.id!);
    });
    loadOrders();
    loadRuns();
  }, []);

  // saved runs come back from the server with warnings in the current language
  useEffect(() => {
    if (savedRunId) api.run(savedRunId).then(setPlan).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  const truck = useMemo(() => trucks.find((t) => t.id === truckId) ?? null, [trucks, truckId]);
  const sel = orders.filter((o) => selected.has(o.id!));
  const selLdm = sel.reduce((a, o) => a + Math.max(o.ldm, truck ? o.volume_m3 / (truck.volume_m3 / truck.ldm_capacity) : 0), 0);
  const selKg = sel.reduce((a, o) => a + o.weight_kg, 0);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const findBest = async () => {
    if (!selected.size) return;
    setComparing(true);
    setError("");
    setFleet(null);
    try {
      const r = await api.compare([...selected]);
      setFleet(r.trucks);
      if (r.best_truck_id) setTruckId(r.best_truck_id);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setComparing(false);
    }
  };

  const optimize = async (save = false, useTruck?: number) => {
    const tid = useTruck ?? truckId;
    if (!tid || !selected.size) return;
    if (useTruck) setTruckId(useTruck);
    setBusy(true);
    setError("");
    try {
      const r = await api.plan([...selected], tid, save);
      setPlan(r);
      if (save) {
        setSavedRunId(r.run_id ?? null);
        setSelected(new Set());
        await Promise.all([loadOrders(), loadRuns()]);
      } else setSavedRunId(null);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const openRun = async (id: number) => {
    setError("");
    const r = await api.run(id);
    setPlan(r);
    setSavedRunId(id);
    if (r.truck?.id) setTruckId(r.truck.id);
  };

  const onMapPick = async (lat: number, lon: number) => {
    if (!pick || !draft) return;
    const target = pick;
    setPick(null);
    const hit = await api.reverse(lat, lon).catch(() => ({ display_name: `${lat.toFixed(5)}, ${lon.toFixed(5)}` }));
    setDraft((d) => ({ ...d, [`${target}_address`]: hit.display_name, [`${target}_lat`]: lat, [`${target}_lon`]: lon }));
  };

  const saveDraft = async () => {
    if (!draft?.delivery_address) return setError(t("deliveryRequired"));
    try {
      const o = await api.createOrder(draft);
      setDraft(null);
      await loadOrders();
      setSelected(new Set([...selected, o.id!]));
    } catch (e) {
      setError(String((e as Error).message));
    }
  };

  const depot = settings?.depot ?? null;

  return (
    <div className="planner">
      <aside className="sidebar">
        <div className="side-section">
          <h3>{t("truck")}</h3>
          <select value={truckId ?? ""} onChange={(e) => setTruckId(Number(e.target.value))}>
            {trucks.filter((t) => t.active || t.id === truckId).map((t) => (
              <option key={t.id} value={t.id}>{truckLabel(t)}{t.active ? "" : tr("unavailableSuffix")}</option>
            ))}
          </select>
          {truck && (
            <div className="row small muted">
              {tentsOf(truck).map((c, i) => <span key={i} className="tag">{c.name} {c.ldm} LDM · {c.max_payload_t} t</span>)}
              <span className="tag">H {truck.height_m} m · L {truck.length_m} m</span>
              <span className="tag">{truck.empty_weight_t + truck.max_payload_t} t GVW</span>
              <span className="tag">{truck.consumption_empty_l100}–{truck.consumption_full_l100} L/100</span>
            </div>
          )}
          <div className="small muted">{t("startEnd")} <b>{depot?.address ?? "…"}</b></div>
        </div>

        <div className="side-section">
          <div className="spread">
            <h3>{t("openOrders", { n: orders.length })}</h3>
            <div className="row">
              <button className="btn ghost" onClick={() => setSelected(new Set(orders.map((o) => o.id!)))}>{t("all")}</button>
              <button className="btn ghost" onClick={() => setSelected(new Set())}>{t("none")}</button>
              <button className="btn" onClick={() => setDraft({ ...EMPTY_ORDER })}>{t("addOrder")}</button>
            </div>
          </div>

          {draft && (
            <div className="card" style={{ padding: 10, gap: 8 }}>
              <div className="grid2">
                <label className="field">{t("reference")}<input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} /></label>
                <label className="field">{t("customer")}<input value={draft.customer} onChange={(e) => setDraft({ ...draft, customer: e.target.value })} /></label>
              </div>
              <label className="field">
                <span className="spread">{t("pickupEmptyDepot")}
                  <button className="btn ghost small" onClick={() => setPick("pickup")}>{t("pickOnMap")}</button></span>
                <AddressInput value={draft.pickup_address ?? ""} placeholder={t("depot")}
                  onChange={(v) => setDraft({ ...draft, pickup_address: v || null, pickup_lat: null, pickup_lon: null })}
                  onSelect={(h) => setDraft({ ...draft, pickup_address: h.display_name, pickup_lat: h.lat, pickup_lon: h.lon })} />
              </label>
              <label className="field">
                <span className="spread">{t("deliveryAddress")}
                  <button className="btn ghost small" onClick={() => setPick("delivery")}>{t("pickOnMap")}</button></span>
                <AddressInput value={draft.delivery_address ?? ""} placeholder={t("streetCity")}
                  onChange={(v) => setDraft({ ...draft, delivery_address: v, delivery_lat: null, delivery_lon: null })}
                  onSelect={(h) => setDraft({ ...draft, delivery_address: h.display_name, delivery_lat: h.lat, delivery_lon: h.lon })} />
              </label>
              <div className="grid4">
                <label className="field">LDM<input type="number" step="0.1" min="0" value={draft.ldm} onChange={(e) => setDraft({ ...draft, ldm: +e.target.value })} /></label>
                <label className="field">m³<input type="number" step="0.5" min="0" value={draft.volume_m3} onChange={(e) => setDraft({ ...draft, volume_m3: +e.target.value })} /></label>
                <label className="field">kg<input type="number" step="10" min="0" value={draft.weight_kg} onChange={(e) => setDraft({ ...draft, weight_kg: +e.target.value })} /></label>
                <label className="field">{t("pallets")}<input type="number" min="0" value={draft.pallets} onChange={(e) => setDraft({ ...draft, pallets: +e.target.value })} /></label>
              </div>
              <label className="row small"><input type="checkbox" checked={draft.hazmat} onChange={(e) => setDraft({ ...draft, hazmat: e.target.checked })} /> {t("adr")}</label>
              <div className="row">
                <button className="btn primary" onClick={saveDraft}>{t("addOrderBtn")}</button>
                <button className="btn" onClick={() => { setDraft(null); setPick(null); }}>{t("cancel")}</button>
                {draft.delivery_lat != null && <span className="tag good">{t("located")}</span>}
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 6 }}>
            {orders.map((o) => (
              <div key={o.id} className={`order-item ${selected.has(o.id!) ? "selected" : ""}`} onClick={() => toggle(o.id!)}>
                <input type="checkbox" checked={selected.has(o.id!)} readOnly />
                <div>
                  <div className="title">{o.reference || `#${o.id}`} <span className="muted">{o.customer}</span></div>
                  <div className="small muted">{o.pickup_address ? `${o.pickup_address.split(",")[0]} → ` : ""}{o.delivery_address}</div>
                </div>
                <div className="small mono" style={{ textAlign: "right" }}>
                  {o.ldm > 0 && <div>{o.ldm} LDM</div>}
                  {o.volume_m3 > 0 && <div>{o.volume_m3} m³</div>}
                  <div>{num(o.weight_kg, 0)} kg</div>
                  {o.hazmat && <span className="tag haz">ADR</span>}
                </div>
              </div>
            ))}
            {!orders.length && <div className="muted small">{t("noOpenOrders")}</div>}
          </div>
        </div>

        <div className="side-section" style={{ position: "sticky", bottom: 0, background: "var(--panel)", borderTop: "1px solid var(--line)" }}>
          {truck && selected.size > 0 && (
            <div className="small muted">
              {t("selectedSummary", { n: selected.size, ldm: num(selLdm, 1), cap: truck.ldm_capacity, t: num(selKg / 1000, 1), tcap: truck.max_payload_t })}
              {(selLdm > truck.ldm_capacity || selKg / 1000 > truck.max_payload_t) && t("overCapacity")}
            </div>
          )}
          <button className="btn block" disabled={comparing || busy || !selected.size} onClick={findBest}
            title={t("findBestTitle")}>
            {comparing ? t("comparing") : t("findBest")}
          </button>
          <div className="grid2">
            <button className="btn primary" disabled={busy || !selected.size} onClick={() => optimize(false)}>
              {busy ? t("optimizing") : t("optimize")}
            </button>
            <button className="btn" disabled={busy || !selected.size || !plan} onClick={() => optimize(true)}
              title={t("saveRunTitle")}>{t("saveRun")}</button>
          </div>
        </div>

        <div className="side-section">
          <h3>{t("savedRuns")}</h3>
          {runs.slice(0, 10).map((r) => (
            <div key={r.id} className="spread small">
              <button className="btn ghost" style={{ textAlign: "left" }} onClick={() => openRun(r.id)}>
                {savedRunId === r.id ? "▸ " : ""}{r.name}
              </button>
              <span className="mono">{num(r.total_km, 0)} km · {eur(r.total_cost, 0)}</span>
            </div>
          ))}
          {!runs.length && <div className="muted small">{t("noSavedRuns")}</div>}
        </div>
      </aside>

      <section className="main-area">
        <MapView depot={depot} orders={orders} selected={selected} plan={plan} truck={truck}
          pickHint={pick ? t("pickHint", { target: t(pick === "pickup" ? "pickupLoc" : "deliveryLoc") }) : undefined} onPick={onMapPick} />
        {(plan || error || fleet) && (
          <div className="results">
            {error && <div className="alert error" style={{ margin: 12 }}>{error}</div>}
            {fleet && (
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
                <div className="spread">
                  <h2>{t("bestTruckFor", { n: selected.size })}</h2>
                  <button className="btn ghost" onClick={() => setFleet(null)}>{t("close")}</button>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{t("colUnit")}</th><th className="num">{t("orders")}</th><th className="num">{t("colTrips")}</th><th className="num">km</th>
                        <th className="num">{t("colDriving")}</th><th className="num">{t("fuel")}</th><th className="num">{t("colUtilisation")}</th>
                        <th className="num">{t("colRunCost")}</th><th className="num">{t("colVsBest")}</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {fleet.map((f) => (
                        <tr key={f.truck_id} style={f.recommended ? { background: "color-mix(in srgb, var(--signal) 10%, transparent)" } : undefined}>
                          <td>
                            <b>{f.label}</b> {f.recommended && <span className="tag good">{t("cheapest")}</span>}
                            <div className="small muted">{t(f.tents > 1 ? "tentN" : "tent1", { n: f.tents })} · {num(f.ldm_capacity, 1)} LDM
                              {f.split_orders ? t("splitAcross", { n: f.split_orders }) : ""}</div>
                            {!f.ok && <div className="small" style={{ color: "var(--bad)" }}>{f.error}</div>}
                            {f.unserved.length > 0 && <div className="small" style={{ color: "var(--bad)" }}>
                              {t("cantTake", { ids: f.unserved.map((u) => `#${u.id}`).join(", ") })}</div>}
                          </td>
                          <td className="num">{f.served}/{selected.size}</td>
                          <td className="num">{f.trips ?? "—"}</td>
                          <td className="num">{num(f.distance_km, 0)}</td>
                          <td className="num">{f.drive_h != null ? hours(f.drive_h) : "—"}</td>
                          <td className="num">{f.fuel_litres != null ? `${num(f.fuel_litres, 0)} L` : "—"}</td>
                          <td className="num">{f.utilization != null ? `${Math.round(f.utilization * 100)}%` : "—"}</td>
                          <td className="num"><b>{eur(f.total_cost)}</b></td>
                          <td className="num">{f.extra_vs_best ? `+${eur(f.extra_vs_best, 0)}` : f.recommended ? "—" : t("na")}</td>
                          <td>{f.ok && <button className={`btn ${f.recommended ? "primary" : ""}`} disabled={busy}
                            onClick={() => { setFleet(null); optimize(false, f.truck_id); }}>{t("use")}</button>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="muted small">{t("rankedNote")}</div>
              </div>
            )}
            {plan && (
              <>
                <div className="spread" style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
                  <h2>{savedRunId ? t("runN", { id: savedRunId }) : t("notSaved")} · {plan.truck.label ?? plan.truck.name}</h2>
                  <button className="btn ghost" onClick={() => { setPlan(null); setSavedRunId(null); }}>{t("close")}</button>
                </div>
                {(plan.warnings.length > 0 || plan.unserved.length > 0) && (
                  <div style={{ display: "grid", gap: 6, padding: "10px 16px 0" }}>
                    {plan.unserved.map((u) => <div key={u.id} className="alert error">{t("orderNotPlanned", { id: u.id, reason: u.reason })}</div>)}
                    {plan.warnings.map((w, i) => <div key={i} className="alert">{w.text}</div>)}
                  </div>
                )}
                <CostBreakdown plan={plan} />
                {plan.loading && <LoadingPlanView plan={plan} />}
                <details style={{ padding: "0 16px 16px" }}>
                  <summary className="muted" style={{ cursor: "pointer", padding: "8px 0" }}>{t("itinerary", { stops: plan.stops.length, legs: plan.legs.length })}</summary>
                  <table className="data">
                    <thead><tr><th>#</th><th>{t("colStop")}</th><th className="num">{t("colLoadAfter")}</th><th className="num">{t("colNextLeg")}</th><th className="num">{t("colGross")}</th><th>{t("colCountries")}</th></tr></thead>
                    <tbody>
                      {plan.stops.map((s, i) => {
                        const leg = plan.legs.find((l) => l.from_seq === i);
                        return (
                          <tr key={i}>
                            <td className="mono">{i}</td>
                            <td><span className="tag">{t(s.kind === "pickup" ? "kindLoad" : s.kind === "delivery" ? "kindUnload" : "kindDepot")}</span>{" "}
                              {s.reference && <b>{s.reference} </b>}<span className="muted">{s.label}</span></td>
                            <td className="num">{num(s.load_kg_after / 1000, 2)} t · {num(s.load_ldm_after, 1)} LDM</td>
                            <td className="num">{leg ? `${num(leg.distance_km)} km · ${hours(leg.duration_h)}` : ""}
                              {leg?.restriction_detour_km != null && leg.restriction_detour_km > 1 && (
                                <div className="small" style={{ color: "var(--bad)" }}>{t("forRestrictions", { km: num(leg.restriction_detour_km) })}</div>)}</td>
                            <td className="num">{leg ? `${num(leg.gross_t)} t` : ""}</td>
                            <td className="small">{leg ? Object.entries(leg.km_by_country).map(([k, v]) => `${k} ${num(v, 0)}`).join(", ") : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </details>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
