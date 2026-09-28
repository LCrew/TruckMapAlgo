import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, FuelPricing, FuelRow } from "../lib/api";
import { Key, numberLocale, useI18n } from "../lib/i18n";

const BRAND_COLORS: Record<string, string> = { "Circle K": "#d62828", "Virši": "#2a9d8f", Viada: "#1f6feb" };

export default function Fuel() {
  const { t } = useI18n();
  const [rows, setRows] = useState<FuelRow[]>([]);
  const [pricing, setPricing] = useState<FuelPricing | null>(null);
  const [hist, setHist] = useState<{ brand: string; fuel_type: string; price: number; fetched_at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    api.fuelLatest().then(setRows);
    api.fuelPricing().then(setPricing);
    api.fuelHistory().then(setHist);
  };
  useEffect(load, []);

  const refresh = async () => {
    setBusy(true);
    try {
      const r = await api.fuelRefresh();
      setMsg(t("updated", { ok: r.sources_ok.join(", ") || t("none") }) +
        (Object.keys(r.errors).length ? t("failedList", { f: Object.keys(r.errors).join(", ") }) : ""));
      load();
    } finally {
      setBusy(false);
    }
  };

  const chart = useMemo(() => {
    const dd = hist.filter((h) => h.fuel_type === "DD");
    const byTime = new Map<string, Record<string, number | string>>();
    dd.forEach((h) => {
      const k = h.fetched_at.slice(0, 13);
      const row = byTime.get(k) ?? { t: new Date(h.fetched_at).toLocaleDateString(numberLocale()) };
      row[h.brand] = h.price;
      byTime.set(k, row);
    });
    return [...byTime.values()];
  }, [hist]);
  const brands = [...new Set(hist.filter((h) => h.fuel_type === "DD").map((h) => h.brand))];

  return (
    <div className="page">
      <div className="page-inner">
        <div className="card">
          <div className="spread">
            <h2>{t("latvianFuelPrices")}</h2>
            <button className="btn primary" disabled={busy} onClick={refresh}>{busy ? t("scraping") : t("refreshNow")}</button>
          </div>
          {pricing && (
            <div className="kpis" style={{ border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
              <div className="kpi"><div className="label">{t("dieselForPricing")}</div>
                <div className="value">€{pricing.price.toFixed(3)}/L</div>
                <div className="sub">{t("modeLabel", { m: t(`mode.${pricing.mode}` as Key) })} · {pricing.mode === "manual-fallback" ? t("noScrapedYet") : pricing.source}</div></div>
              <div className="kpi"><div className="label">{t("lastUpdate")}</div>
                <div className="value" style={{ fontSize: 14 }}>{pricing.fetched_at ? new Date(pricing.fetched_at).toLocaleString(numberLocale()) : "—"}</div>
                <div className="sub" style={{ color: pricing.stale ? "var(--bad)" : undefined }}>{pricing.stale ? t("staleCheck") : t("refreshEvery")}</div></div>
            </div>
          )}
          {msg && <div className="alert">{msg}</div>}
          <table className="data">
            <thead><tr><th>{t("brand")}</th><th>{t("fuel")}</th><th className="num">€/L</th><th>{t("colWhere")}</th><th>{t("colFetched")}</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.fuel_type === "DD" ? { fontWeight: 600 } : undefined}>
                  <td><a href={r.source_url} target="_blank" rel="noreferrer">{r.brand}</a></td>
                  <td>{r.fuel_type === "DD" ? t("ddDiesel") : r.fuel_type}</td>
                  <td className="num">{r.price_eur_l.toFixed(3)}</td>
                  <td className="small muted">{r.location.slice(0, 120)}</td>
                  <td className="small muted">{new Date(r.fetched_at + (r.fetched_at.endsWith("Z") || r.fetched_at.includes("+") ? "" : "Z")).toLocaleString(numberLocale())}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted small">{t("fuelNote")}</div>
        </div>
        <div className="card">
          <h2>{t("historyTitle")}</h2>
          {chart.length > 1 ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={chart}>
                  <CartesianGrid stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fontSize: 11, fill: "var(--ink-2)" }} />
                  <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--ink-2)" }} tickFormatter={(v) => `€${v.toFixed(2)}`} width={56} />
                  <Tooltip formatter={(v: number) => `€${v.toFixed(3)}`} />
                  <Legend />
                  {brands.map((b) => <Line key={b} dataKey={b} stroke={BRAND_COLORS[b] ?? "#888"} dot={false} strokeWidth={2} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="muted">{t("historyEmpty")}</div>}
        </div>
      </div>
    </div>
  );
}
