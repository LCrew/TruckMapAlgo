import { useEffect, useMemo, useState } from "react";
import Icon from "../components/Icon";
import OrderDialog, { EMPTY_ORDER } from "../components/OrderDialog";
import { ConfirmButton, FileButton, Seg, Spinner, useToast } from "../components/ui";
import { api, eur, num, Order } from "../lib/api";
import { Key, numberLocale, useI18n } from "../lib/i18n";
import { flash } from "../lib/motion";

type Status = Awaited<ReturnType<typeof api.predictorStatus>>;
type Filter = "all" | "open" | "planned" | "delivered";
const STATUSES = ["open", "planned", "delivered"] as const;

function PriceInput({ o, onSaved }: { o: Order; onSaved: (v: number | null) => void }) {
  const { t } = useI18n();
  const initial = o.actual_price?.toString() ?? "";
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = v !== initial;
  const save = async () => {
    if (!dirty) return;
    setBusy(true);
    try {
      const price = v === "" ? null : +v;
      await api.setActualPrice(o.id!, price);
      onSaved(price);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="price-input">
      <input className="sm right" type="number" step="1" min="0" inputMode="decimal" value={v} placeholder="€"
        disabled={!o.run_id || busy} title={o.run_id ? t("priceCellTitle") : t("planFirst")} aria-label={t("colInvoiced")}
        onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
      {busy && <Spinner size={16} />}
    </div>
  );
}

export default function Orders({ goTo }: { goTo: (tab: string) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Partial<Order> | null>(null);
  const [error, setError] = useState("");
  const [model, setModel] = useState<Status | null>(null);
  const [training, setTraining] = useState(false);

  const load = () =>
    api.orders().then((o) => { setOrders(o); setLoaded(true); }).catch((e) => setError((e as Error).message));
  const loadModel = () => api.predictorStatus().then(setModel).catch(() => {});

  useEffect(() => {
    load();
    loadModel();
  }, []);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: orders.length, open: 0, planned: 0, delivered: 0 };
    orders.forEach((o) => { if (o.status && o.status in c) c[o.status as Filter]++; });
    return c;
  }, [orders]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders
      .filter((o) => filter === "all" || o.status === filter)
      .filter((o) => !q || [o.reference, o.customer, o.delivery_address, o.pickup_address, String(o.id)].some((v) => v?.toLowerCase().includes(q)));
  }, [orders, filter, query]);

  const patch = (id: number, p: Partial<Order>) => setOrders((prev) => prev.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const setStatus = async (o: Order, status: string) => {
    try {
      const r = await api.updateOrder(o.id!, { status });
      patch(o.id!, r ?? { status });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (o: Order) => {
    try {
      await api.deleteOrder(o.id!);
      setOrders((prev) => prev.filter((x) => x.id !== o.id));
      toast(t("orderDeleted", { ref: o.reference || `#${o.id}` }));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const importOrders = async (f: File) => {
    setError("");
    try {
      const r = await api.importOrders(f);
      toast(t("importedOrders", { n: r.imported }), { label: t("tab.Planner"), run: () => goTo("Planner") });
      setFilter("open");
      load();
    } catch (e) {
      setError(t("importFailed", { e: (e as Error).message }));
    }
  };

  const importHistory = async (f: File) => {
    setError("");
    try {
      const r = await api.importHistory(f);
      toast(t("importedHistory", { n: r.imported }));
      loadModel();
    } catch (e) {
      setError(t("importFailed", { e: (e as Error).message }));
    }
  };

  const train = async () => {
    setTraining(true);
    try {
      const r = await api.train();
      toast(r.trained ? t("trainedMsg", { n: r.samples }) : t("needSamples", { r: r.required ?? model?.required ?? "", n: r.samples }));
      loadModel();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTraining(false);
    }
  };

  const onSaved = (o: Order, isNew: boolean) => {
    setDraft(null);
    if (isNew) {
      setOrders((prev) => [o, ...prev]);
      setFilter((f) => (f === "all" || f === "open" ? f : "open"));
      setQuery("");
      toast(t("orderAdded"), { label: t("tab.Planner"), run: () => goTo("Planner") });
    } else {
      setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)));
      toast(t("orderSaved"));
    }
    setTimeout(() => flash(document.querySelector(`.ord-card[data-id="${o.id}"]`)), 60);
  };

  const ratio = model ? Math.min(1, model.samples_available / Math.max(1, model.required)) : 0;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{t("tab.Orders")}<span>{t("ordersSub", { n: counts.open })}</span></h1>
        <div className="row">
          <FileButton accept=".csv,text/csv" onFile={importOrders}><Icon name="upload" size={18} />{t("importCsv")}</FileButton>
          <button className="btn primary" onClick={() => setDraft({ ...EMPTY_ORDER })}><Icon name="plus" size={18} />{t("newOrderBtn")}</button>
        </div>
      </div>

      <div className="page-cols">
        <section className="stack">
          <div className="toolbar">
            <Seg value={filter} onChange={setFilter} label={t("colStatus")}
              options={(["all", ...STATUSES] as Filter[]).map((f) => ({
                value: f, label: f === "all" ? t("allStatuses") : t(`status.${f}` as Key), count: counts[f],
              }))} />
            <label className="search">
              <Icon name="search" size={18} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchOrders")} aria-label={t("searchOrders")} />
              {query && <button className="icon-btn sm" onClick={() => setQuery("")} aria-label={t("clear")}><Icon name="x" size={16} /></button>}
            </label>
          </div>

          {error && (
            <div className="alert error">
              <Icon name="alert" size={18} /><span className="grow">{error}</span>
              <button className="icon-btn sm" onClick={() => setError("")} aria-label={t("closeLabel")}><Icon name="x" size={16} /></button>
            </div>
          )}

          {loaded && orders.length === 0 ? (
            <div className="pane">
              <div className="empty-state">
                <span className="ic"><Icon name="box" size={26} /></span>
                <span className="strong" style={{ color: "var(--ink)" }}>{t("noOrdersYet")}</span>
                <span className="small">{t("noOrdersYetHint")}</span>
              </div>
            </div>
          ) : (
            <div className="list list--in" key={filter}>
              {shown.map((o, i) => (
                <article key={o.id} data-id={o.id} className="card ord-card" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
                  <div className="stack tight" style={{ minWidth: 0 }}>
                    <span className="row nowrap" style={{ minWidth: 0 }}>
                      <b className="oc-ref">{o.reference || `#${o.id}`}</b>
                      <span className="muted ellipsis">{o.customer}</span>
                    </span>
                    <span className="small muted ellipsis" title={`${o.pickup_address || t("depot")} → ${o.delivery_address}`}>
                      {o.pickup_address ? o.pickup_address.split(",")[0] : t("depot")} → {o.delivery_address}
                    </span>
                    {(o.hazmat || (!o.run_id && o.delivery_lat == null)) && (
                      <span className="oc-tags">
                        {o.hazmat && <span className="pill alert">ADR</span>}
                        {!o.run_id && o.delivery_lat == null && <span className="pill warn">{t("notLocated")}</span>}
                      </span>
                    )}
                  </div>

                  <div className="small num oc-load">
                    <b>{num(o.ldm, 1)}</b> LDM · {num(o.volume_m3, 0)} m³<br />
                    <span className="muted">{num(o.weight_kg / 1000, 1)} t{o.pallets ? ` · ${o.pallets} pal.` : ""}</span>
                  </div>

                  <div className="row nowrap oc-actions">
                    <select className="status sm" value={o.status} onChange={(e) => setStatus(o, e.target.value)} aria-label={t("colStatus")}>
                      {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}` as Key)}</option>)}
                    </select>
                    <button className="icon-btn sm" title={t("edit")} aria-label={t("edit")} onClick={() => setDraft({ ...o })}><Icon name="edit" size={16} /></button>
                    <ConfirmButton className="icon-btn sm danger" title={t("delete")} onConfirm={() => remove(o)} />
                  </div>

                  {o.run_id != null && (
                    <div className="oc-money">
                      <span className="xsmall faint">{t("runRef", { id: o.run_id })}</span>
                      <div><span className="lbl">{t("colAllocated")}</span><span className="val">{o.allocated_cost != null ? eur(o.allocated_cost, 0) : "—"}</span></div>
                      <div><span className="lbl">{t("colPredictedShort")}</span><span className="val">{o.predicted_price != null ? eur(o.predicted_price, 0) : "—"}</span></div>
                      <div><span className="lbl">{t("colInvoiced")}</span>
                        <PriceInput key={`${o.id}-${o.actual_price}`} o={o} onSaved={(v) => patch(o.id!, { actual_price: v })} />
                      </div>
                    </div>
                  )}
                </article>
              ))}
              {loaded && shown.length === 0 && <p className="small muted" style={{ padding: 8 }}>{t("noOrdersMatch")}</p>}
            </div>
          )}

          <details className="disclosure">
            <summary><span className="row small muted"><Icon name="info" size={18} />{t("csvFormat")}</span><span className="fold-ic"><Icon name="chevron" size={18} /></span></summary>
            <p className="small muted" style={{ margin: 0 }}>{t("ordersCsvHelp")}</p>
          </details>
        </section>

        <aside className="pane">
          <div className="pane-title">
            <h3>{t("modelTitle")}</h3>
            <span className={`pill ${model?.trained ? "ok" : ""}`}><span className="dot" />{model?.trained ? t("trained") : t("notTrained")}</span>
          </div>
          {model && (
            <>
              <div className="progress-ring">
                <span className="big-num">{model.samples_available}</span>
                <span className="small muted">{t("samples", { n: model.samples_available, r: model.required })}</span>
              </div>
              <div className="meter route"><span style={{ width: `${ratio * 100}%` }} /></div>
              {(model.cv_mae != null || model.trained_at) && (
                <div className="kv">
                  {model.cv_mae != null && <span>{t("cvError", { v: eur(model.cv_mae, 0) })}</span>}
                  {model.trained_at && <span>{t("trainedAt", { d: new Date(model.trained_at).toLocaleDateString(numberLocale()) })}</span>}
                </div>
              )}
              <p className="small muted" style={{ margin: 0 }}>{t("modelExplain", { r: model.required })}</p>
              <div className="stack tight">
                <button className={`btn primary block ${training ? "busy" : ""}`} onClick={train} disabled={training || model.samples_available < model.required}>
                  {training ? <Spinner /> : <Icon name="model" size={18} />}{t("trainModel")}
                </button>
                <FileButton className="btn block" accept=".csv,text/csv" onFile={importHistory}><Icon name="upload" size={18} />{t("importHistory")}</FileButton>
              </div>
              <details className="disclosure">
                <summary><span className="small muted">{t("csvColumns")}</span><span className="fold-ic"><Icon name="chevron" size={18} /></span></summary>
                <code className="mono xsmall" style={{ wordBreak: "break-all" }}>{model.csv_columns.join(",")}</code>
              </details>
            </>
          )}
        </aside>
      </div>

      {draft && <OrderDialog draft={draft} setDraft={setDraft} onClose={() => setDraft(null)} onSaved={onSaved} />}
    </div>
  );
}
