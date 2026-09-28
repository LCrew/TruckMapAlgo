import { useEffect, useState } from "react";
import { api, eur, num, Order } from "../lib/api";
import { numberLocale, useI18n } from "../lib/i18n";

type Status = Awaited<ReturnType<typeof api.predictorStatus>>;

function PriceCell({ o, onSaved }: { o: Order; onSaved: () => void }) {
  const { t } = useI18n();
  const [v, setV] = useState(o.actual_price?.toString() ?? "");
  const dirty = v !== (o.actual_price?.toString() ?? "");
  return (
    <div className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
      <input style={{ width: 90, textAlign: "right" }} type="number" step="1" value={v} placeholder="€"
        disabled={!o.run_id} title={o.run_id ? t("priceCellTitle") : t("planFirst")}
        onChange={(e) => setV(e.target.value)} />
      {dirty && (
        <button className="btn" onClick={async () => { await api.setActualPrice(o.id!, v === "" ? null : +v); onSaved(); }}>{t("save")}</button>
      )}
    </div>
  );
}

export default function Orders() {
  const { t } = useI18n();
  const [orders, setOrders] = useState<Order[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");
  const [filter, setFilter] = useState("");

  const load = () => {
    api.orders(filter || undefined).then(setOrders);
    api.predictorStatus().then(setStatus);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [filter]);

  const importCsv = async (f: File | undefined, kind: "orders" | "history") => {
    if (!f) return;
    try {
      const r = kind === "orders" ? await api.importOrders(f) : await api.importHistory(f);
      setMsg(t(kind === "orders" ? "importedOrders" : "importedHistory", { n: r.imported }));
      load();
    } catch (e) {
      setMsg(t("importFailed", { e: (e as Error).message }));
    }
  };

  return (
    <div className="page">
      <div className="page-inner">
        <div className="card">
          <div className="spread">
            <h2>{t("orders")}</h2>
            <div className="row">
              <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 140 }}>
                <option value="">{t("allStatuses")}</option>
                <option value="open">{t("status.open")}</option>
                <option value="planned">{t("status.planned")}</option>
                <option value="delivered">{t("status.delivered")}</option>
              </select>
              <label className="btn">{t("importOrdersCsv")}
                <input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files?.[0], "orders")} /></label>
            </div>
          </div>
          <div className="muted small">{t("ordersCsvHelp")}</div>
          {msg && <div className="alert">{msg}</div>}
          <div style={{ overflowX: "auto" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>{t("order")}</th><th>{t("colStatus")}</th><th className="num">{t("colLoad")}</th><th className="num">{t("colShare")}</th>
                  <th className="num">{t("colAllocated")}</th><th className="num">{t("colPredictedShort")}</th><th className="num">{t("colInvoiced")}</th><th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td><b>{o.reference || `#${o.id}`}</b> <span className="muted">{o.customer}</span>
                      <div className="small muted">{o.pickup_address ? `${o.pickup_address} → ` : `${t("depot")} → `}{o.delivery_address}</div></td>
                    <td>
                      <select value={o.status} style={{ width: 110 }} onChange={async (e) => { await api.updateOrder(o.id!, { status: e.target.value }); load(); }}>
                        <option value="open">{t("status.open")}</option><option value="planned">{t("status.planned")}</option><option value="delivered">{t("status.delivered")}</option>
                      </select>
                      {o.run_id && <div className="small muted">{t("runRef", { id: o.run_id })}</div>}
                    </td>
                    <td className="num small">{o.ldm} LDM · {o.volume_m3} m³<br />{num(o.weight_kg, 0)} kg {o.hazmat && <span className="tag haz">ADR</span>}</td>
                    <td className="num">{o.share != null ? `${(o.share * 100).toFixed(1)}%` : "—"}</td>
                    <td className="num">{eur(o.allocated_cost)}</td>
                    <td className="num">{eur(o.predicted_price)}</td>
                    <td className="num"><PriceCell key={`${o.id}-${o.actual_price}`} o={o} onSaved={load} /></td>
                    <td><button className="btn ghost danger" onClick={async () => { await api.deleteOrder(o.id!); load(); }}>{t("delete")}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h2>{t("modelTitle")}</h2>
          {status && (
            <>
              <div className="row">
                <span className="tag">{status.trained ? t("trained") : t("notTrained")}</span>
                <span className="tag">{t("samples", { n: status.samples_available, r: status.required })}</span>
                {status.cv_mae != null && <span className="tag">{t("cvError", { v: eur(status.cv_mae, 0) })}</span>}
                {status.trained_at && <span className="tag">{t("trainedAt", { d: new Date(status.trained_at).toLocaleString(numberLocale()) })}</span>}
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {t("modelExplain", { r: status.required })}
              </p>
              <div className="row">
                <button className="btn primary" disabled={status.samples_available < status.required}
                  onClick={async () => { const r = await api.train(); setMsg(r.trained ? t("trainedMsg", { n: r.samples }) : t("needSamples", { r: r.required ?? 0, n: r.samples })); load(); }}>
                  {t("trainModel")}
                </button>
                <label className="btn">{t("importHistory")}
                  <input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files?.[0], "history")} /></label>
              </div>
              <div className="muted small mono">{status.csv_columns.join(",")}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
