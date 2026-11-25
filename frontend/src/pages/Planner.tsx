import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../components/Icon";
import MapView from "../components/MapView";
import OrderDialog, { EMPTY_ORDER, PickTarget } from "../components/OrderDialog";
import PlanResultPane from "../components/PlanResultPane";
import { ConfirmButton, Seg, Spinner, useToast } from "../components/ui";
import { api, eur, FleetOption, num, Order, PlanResult, Settings, tentsOf, Truck, truckLabel } from "../lib/api";
import { numberLocale, useI18n } from "../lib/i18n";
import { flash } from "../lib/motion";

type Run = { id: number; name: string; created_at: string; total_cost: number; total_km: number };
type Busy = "" | "compare" | "plan" | "save";
const AUTO = "auto";
const idsKey = (ids: Iterable<number>) => [...ids].sort((a, b) => a - b).join(",");

export default function Planner({ settings, goTo }: { settings: Settings | null; goTo: (tab: string) => void }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const [view, setView] = useState<"plan" | "runs">("plan");
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [truckChoice, setTruckChoice] = useState<string>(AUTO);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [hoverLeg, setHoverLeg] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  // phones: the result opens as a sheet under the map, so bring the map (with the route) into view
  const hasPlan = plan != null;
  useEffect(() => {
    if (hasPlan && window.matchMedia("(max-width: 800px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [hasPlan]);
  const [planIds, setPlanIds] = useState("");
  const [fleet, setFleet] = useState<FleetOption[] | null>(null);
  const [savedRunId, setSavedRunId] = useState<number | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<Busy>("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Partial<Order> | null>(null);
  const [picking, setPicking] = useState<PickTarget | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const loadOrders = () => api.orders("open").then((o) => { setOrders(o); setLoaded(true); });
  const loadRuns = () => api.runs().then(setRuns);

  useEffect(() => {
    api.trucks().then(setTrucks).catch((e) => setError((e as Error).message));
    loadOrders().catch((e) => setError((e as Error).message));
    loadRuns().catch(() => {});
  }, []);

  // saved runs come back from the server with warnings in the current language
  useEffect(() => {
    if (savedRunId) api.run(savedRunId).then(setPlan).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // Esc leaves map-picking and returns to the order form
  useEffect(() => {
    if (!picking) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPicking(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  const depot = settings?.depot ?? null;
  const active = trucks.filter((x) => x.active);
  const truck = truckChoice === AUTO ? null : trucks.find((x) => String(x.id) === truckChoice) ?? null;
  const sel = orders.filter((o) => selected.has(o.id!));
  const selLdm = sel.reduce((a, o) => a + Math.max(o.ldm, truck ? o.volume_m3 / (truck.volume_m3 / truck.ldm_capacity) : 0), 0);
  const selT = sel.reduce((a, o) => a + o.weight_kg, 0) / 1000;
  const stale = !!plan && !savedRunId && idsKey(selected) !== planIds;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.reference, o.customer, o.delivery_address, o.pickup_address, String(o.id)].some((v) => v?.toLowerCase().includes(q)));
  }, [orders, query]);

  const toggle = (id: number) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const runPlan = async (tid: number, ids: number[], keepFleet: boolean) => {
    setBusy("plan");
    try {
      const r = await api.plan(ids, tid, false);
      setPlan(r);
      setPlanIds(idsKey(ids));
      setSavedRunId(null);
      if (!keepFleet) setFleet(null);
    } finally {
      setBusy("");
    }
  };

  const planRoute = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    setError("");
    try {
      if (truckChoice === AUTO) {
        setBusy("compare");
        const r = await api.compare(ids);
        setFleet(r.trucks);
        if (!r.best_truck_id) {
          setBusy("");
          return setError(t("noTruckFits"));
        }
        await runPlan(r.best_truck_id, ids, true);
      } else {
        await runPlan(+truckChoice, ids, false);
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  };

  const pickTruck = (tid: number) =>
    runPlan(tid, planIds.split(",").map(Number), true).catch((e) => setError((e as Error).message));

  const saveRun = async () => {
    if (!plan) return;
    setBusy("save");
    try {
      const r = await api.plan(planIds.split(",").map(Number), plan.truck.id!, true);
      setPlan(r);
      setSavedRunId(r.run_id ?? null);
      setSelected(new Set());
      toast(t("runSaved", { id: r.run_id ?? "" }), { label: t("savedRuns"), run: () => setView("runs") });
      loadOrders();
      loadRuns();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const openRun = async (id: number) => {
    setError("");
    try {
      const r = await api.run(id);
      setPlan(r);
      setSavedRunId(id);
      setFleet(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteRun = async (id: number) => {
    try {
      await api.deleteRun(id);
      if (savedRunId === id) closePlan();
      toast(t("runDeleted"));
      loadRuns();
      loadOrders();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const closePlan = () => {
    setPlan(null);
    setSavedRunId(null);
    setFleet(null);
    setPlanIds("");
  };

  const onMapPick = async (lat: number, lon: number) => {
    const target = picking;
    if (!target || !draft) return;
    setPicking(null);
    let name = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    try {
      name = (await api.reverse(lat, lon)).display_name || name;
    } catch {
      /* keep coordinates as the label */
    }
    setDraft({ ...draft, [`${target}_address`]: name, [`${target}_lat`]: lat, [`${target}_lon`]: lon });
  };

  const startPick = (target: PickTarget) => {
    setPicking(target);
    if (matchMedia("(max-width: 800px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const onOrderSaved = (o: Order, isNew: boolean) => {
    setDraft(null);
    if (isNew) {
      setOrders((prev) => [o, ...prev]);
      setSelected((prev) => new Set(prev).add(o.id!));
      setQuery("");
      toast(t("orderAdded"));
    } else {
      setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
      toast(t("orderSaved"));
    }
    setTimeout(() => flash(listRef.current?.querySelector(`[data-id="${o.id}"]`) ?? null), 60);
  };

  const meters = truck && sel.length > 0 && [
    { label: "LDM", v: selLdm, cap: truck.ldm_capacity, unit: "" },
    { label: t("weight"), v: selT, cap: truck.max_payload_t, unit: " t" },
  ];
  const over = !!meters && meters.some((m) => m.v > m.cap + 1e-6);
  const planCurrent = !!plan && !stale && !savedRunId;
  const planBtnLabel = busy === "compare" ? t("comparing") : busy === "plan" ? t("optimizing")
    : planCurrent ? t("planUpToDate") : plan && !savedRunId ? t("updatePlan") : t("planRoute");

  return (
    <div className="planner">
      <MapView depot={depot} orders={orders} selected={selected} hoverId={hoverId} plan={plan} highlightLeg={hoverLeg} onHoverLeg={setHoverLeg} truck={truck ?? active[0] ?? null}
        picking={!!picking} onPick={onMapPick} onToggleOrder={toggle} />

      {picking && (
        <div className="map-hint" role="status">
          <Icon name="pin" size={18} />
          <span>{t("pickHint", { target: t(picking === "pickup" ? "pickupLoc" : "deliveryLoc") })}</span>
          <button onClick={() => setPicking(null)}>{t("cancel")}</button>
        </div>
      )}

      <section className="float-pane plan-pane" aria-label={t("tab.Planner")}>
        <div className="fp-head">
          <Seg full value={view} onChange={setView} label={t("tab.Planner")}
            options={[{ value: "plan", label: t("newPlan") }, { value: "runs", label: t("savedRuns"), count: runs.length }]} />
        </div>

        {view === "plan" ? (
          <>
            <div className="fp-body">
              <div className="step">
                <div className="step-head">
                  <h3 style={{ fontSize: 17 }}><span className={`step-num ${selected.size ? "done" : ""}`}>1</span>{t("stepOrders")}</h3>
                  <button className="btn small" onClick={() => setDraft({ ...EMPTY_ORDER })}><Icon name="plus" size={16} />{t("newOrderBtn")}</button>
                </div>

                {loaded && orders.length === 0 ? (
                  <div className="empty-state">
                    <span className="ic"><Icon name="box" size={26} /></span>
                    <span className="strong" style={{ color: "var(--ink)" }}>{t("noOpenOrders")}</span>
                    <span className="small">{t("noOpenOrdersHint")}</span>
                    <button className="btn small" onClick={() => goTo("Orders")}><Icon name="upload" size={16} />{t("importOrdersCsv")}</button>
                  </div>
                ) : (
                  <>
                    <div className="row">
                      <label className="search grow">
                        <Icon name="search" size={18} />
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchOrders")} aria-label={t("searchOrders")} />
                        {query && <button className="icon-btn sm" onClick={() => setQuery("")} aria-label={t("clear")}><Icon name="x" size={16} /></button>}
                      </label>
                      <button className="chip sm" onClick={() => setSelected(new Set([...selected, ...shown.map((o) => o.id!)]))}>{t("all")}</button>
                      <button className="chip sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>{t("none")}</button>
                    </div>
                    <div className="list" ref={listRef}>
                      {shown.map((o) => {
                        const on = selected.has(o.id!);
                        return (
                          <div key={o.id} data-id={o.id} className={`card click order-row ${on ? "on" : ""}`} onClick={() => toggle(o.id!)}
                            onMouseEnter={() => setHoverId(o.id!)} onMouseLeave={() => setHoverId(null)}>
                            <button type="button" className={`check ${on ? "on" : ""}`} aria-pressed={on}
                              aria-label={`${o.reference || `#${o.id}`} ${o.customer}`} style={{ padding: 0, background: on ? undefined : "none", cursor: "pointer" }}>
                              <Icon name="check" size={14} stroke={2.6} />
                            </button>
                            <div className="or-main">
                              <span className="or-title" title={`${o.reference || `#${o.id}`} · ${o.customer}`}>
                                <span className="or-ref">{o.reference || `#${o.id}`}</span>
                                <span className="muted ellipsis">{o.customer}</span>
                              </span>
                              <span className="or-sub" title={o.delivery_address}>
                                {o.pickup_address ? `${o.pickup_address.split(",")[0]} → ` : ""}{o.delivery_address}
                              </span>
                              {(o.hazmat || o.delivery_lat == null) && (
                                <span className="or-tags">
                                  {o.hazmat && <span className="pill alert">ADR</span>}
                                  {o.delivery_lat == null && <span className="pill warn">{t("notLocated")}</span>}
                                </span>
                              )}
                            </div>
                            <div className="or-load">
                              <b>{num(o.ldm, 1)}</b> LDM<br />{num(o.weight_kg / 1000, 1)} t
                            </div>
                            <button type="button" className="icon-btn sm" title={t("edit")} aria-label={t("edit")}
                              onClick={(e) => { e.stopPropagation(); setDraft({ ...o }); }}>
                              <Icon name="edit" size={16} />
                            </button>
                          </div>
                        );
                      })}
                      {loaded && shown.length === 0 && <p className="small muted" style={{ padding: "8px 4px" }}>{t("noOrdersMatch")}</p>}
                    </div>
                  </>
                )}
              </div>

              <div className="step">
                <div className="step-head">
                  <h3 style={{ fontSize: 17 }}><span className="step-num">2</span>{t("stepTruck")}</h3>
                </div>
                <select value={truckChoice} onChange={(e) => setTruckChoice(e.target.value)} aria-label={t("truck")}>
                  <option value={AUTO}>{t("autoTruck")}</option>
                  {trucks.map((x) => (
                    <option key={x.id} value={String(x.id)}>{truckLabel(x)}{x.active ? "" : t("unavailableSuffix")}</option>
                  ))}
                </select>
                {truck ? (
                  <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                    {tentsOf(truck).map((c, i) => <span key={i} className="pill">{c.name} · {c.ldm} LDM · {c.max_payload_t} t</span>)}
                  </div>
                ) : (
                  <p className="small muted">{t("autoTruckHint", { n: active.length })}</p>
                )}
                <p className="small muted row" style={{ alignItems: "flex-start" }}>
                  <Icon name="home" size={16} />
                  <span>{t("startEnd")} <b style={{ color: "var(--ink)", fontWeight: 500 }}>{depot?.address ?? "…"}</b>
                    {" · "}<button className="btn ghost small" style={{ minHeight: 0, padding: 0, height: "auto", display: "inline" }}
                      onClick={() => goTo("Settings")}>{t("change")}</button></span>
                </p>
              </div>
            </div>

            <div className="fp-foot">
              {sel.length > 0 ? (
                <div className="summary-line">
                  <span><b>{t("nSelected", { n: sel.length })}</b></span>
                  <span><b>{num(selLdm, 1)}</b> LDM</span>
                  <span><b>{num(selT, 1)}</b> t</span>
                  {sel.some((o) => o.hazmat) && <span className="pill alert">ADR</span>}
                </div>
              ) : (
                <span className="small muted">{t("selectOrdersFirst")}</span>
              )}
              {meters && (
                <div className="stack tight">
                  {meters.map((m) => (
                    <div key={m.label} className="meter-row">
                      <span className="muted">{m.label}</span>
                      <div className={`meter ${m.v > m.cap + 1e-6 ? "over" : ""}`}><span style={{ width: `${Math.min(100, (m.v / m.cap) * 100)}%` }} /></div>
                      <span className={`num xsmall ${m.v > m.cap + 1e-6 ? "bad-ink" : ""}`}>{num(m.v, 1)}/{num(m.cap, 1)}{m.unit}</span>
                    </div>
                  ))}
                  {over && <span className="xsmall bad-ink">{t("overCapacity")}</span>}
                </div>
              )}
              {error && <div className="alert error"><Icon name="alert" size={18} /><span>{error}</span></div>}
              <button className="btn primary big block" onClick={planRoute} disabled={!selected.size || !!busy || planCurrent}>
                {busy === "compare" || busy === "plan" ? <Spinner /> : <Icon name={planCurrent ? "check" : "route"} size={20} />}
                {planBtnLabel}
              </button>
            </div>
          </>
        ) : (
          <div className="fp-body">
            {runs.length === 0 ? (
              <div className="empty-state">
                <span className="ic"><Icon name="list" size={26} /></span>
                <span>{t("noSavedRuns")}</span>
              </div>
            ) : (
              <div className="list list--in">
                {runs.map((r, i) => (
                  <div key={r.id} className={`card click order-row ${savedRunId === r.id ? "on" : ""}`} style={{ "--i": Math.min(i, 10) } as React.CSSProperties}
                    onClick={() => openRun(r.id)} role="button" tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openRun(r.id))}>
                    <span className="ic" style={{ width: 36, height: 36 }}><Icon name="route" size={18} /></span>
                    <div className="or-main">
                      <span className="or-title"><span className="ellipsis">{r.name || t("runN", { id: r.id })}</span></span>
                      <span className="or-sub">{new Date(r.created_at).toLocaleString(numberLocale(), { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                    <div className="or-load"><b>{eur(r.total_cost, 0)}</b><br />{num(r.total_km, 0)} km</div>
                    <ConfirmButton className="icon-btn sm danger" title={t("deleteRun")} onConfirm={() => deleteRun(r.id)} />
                  </div>
                ))}
              </div>
            )}
            <p className="xsmall faint">{t("deleteRunNote")}</p>
          </div>
        )}
      </section>

      {plan && (
        <PlanResultPane plan={plan} hoverLeg={hoverLeg} onHoverLeg={setHoverLeg} savedRunId={savedRunId} fleet={fleet} busy={busy} stale={stale}
          onSave={saveRun} onClose={closePlan} onUseTruck={pickTruck} onReplan={planRoute} />
      )}

      {draft && !picking && (
        <OrderDialog draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} onSaved={onOrderSaved} onPick={startPick} />
      )}
    </div>
  );
}
