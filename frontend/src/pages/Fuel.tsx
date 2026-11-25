import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Icon from "../components/Icon";
import { useToast } from "../components/ui";
import { api, FuelPricing, FuelRow } from "../lib/api";
import { Key, numberLocale, useI18n } from "../lib/i18n";

const BRAND_COLORS: Record<string, string> = { "Circle K": "#E5484D", "Virši": "#2E9E6B", Viada: "#3C6FD8" };
const brandColor = (b: string) => BRAND_COLORS[b] ?? "#8C8F94";
const asDate = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);

export default function Fuel() {
  const { t } = useI18n();
  const toast = useToast();
  const [rows, setRows] = useState<FuelRow[]>([]);
  const [pricing, setPricing] = useState<FuelPricing | null>(null);
  const [hist, setHist] = useState<{ brand: string; fuel_type: string; price: number; fetched_at: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.fuelLatest().then(setRows).catch((e) => setError((e as Error).message));
    api.fuelPricing().then(setPricing).catch(() => {});
    api.fuelHistory().then(setHist).catch(() => {});
  };
  useEffect(load, []);

  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.fuelRefresh();
      const failed = Object.keys(r.errors);
      toast(t("updated", { ok: r.sources_ok.join(", ") || t("none") }) + (failed.length ? t("failedList", { f: failed.join(", ") }) : ""));
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const { data, brands } = useMemo(() => {
    const byHour: Record<string, Record<string, number | string>> = {};
    const bs = new Set<string>();
    for (const h of hist) {
      if (h.fuel_type !== "DD") continue;
      const k = h.fetched_at.slice(0, 13);
      byHour[k] ??= { x: asDate(h.fetched_at).toLocaleDateString(numberLocale(), { day: "numeric", month: "short" }) };
      byHour[k][h.brand] = h.price;
      bs.add(h.brand);
    }
    return { data: Object.keys(byHour).sort().map((k) => byHour[k]), brands: [...bs] };
  }, [hist]);

  const diesel = rows.filter((r) => r.fuel_type === "DD" || r.is_diesel).sort((a, b) => a.price_eur_l - b.price_eur_l);
  const cheapest = diesel[0];
  const shownRows = [...rows].sort((a, b) => Number(b.fuel_type === "DD") - Number(a.fuel_type === "DD") || a.price_eur_l - b.price_eur_l);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{t("tab.Fuel")}<span>{t("latvianFuelPrices")}</span></h1>
        <button className="btn" onClick={refresh} disabled={busy}>
          <Icon name="refresh" size={18} className={busy ? "spin" : ""} />{busy ? t("scraping") : t("refreshNow")}
        </button>
      </div>

      {error && <div className="alert error"><Icon name="alert" size={18} /><span>{error}</span></div>}

      {pricing && (
        <div className="tiles">
          <div className="tile hero" style={{ "--i": 0 } as React.CSSProperties}>
            <span className="t-label">{t("dieselForPricing")}</span>
            <span className="t-value">€{pricing.price.toFixed(3)}<span style={{ fontSize: 14, fontWeight: 500 }}> /L</span></span>
            <span className="t-sub">
              {t("modeLabel", { m: t(`mode.${pricing.mode}` as Key) })} · {pricing.mode === "manual-fallback" ? t("noScrapedYet") : pricing.source}
            </span>
          </div>
          <div className="tile" style={{ "--i": 1 } as React.CSSProperties}>
            <span className="t-label">{t("cheapestNow")}</span>
            <span className="t-value">{cheapest ? `€${cheapest.price_eur_l.toFixed(3)}` : "—"}</span>
            <span className="t-sub">{cheapest?.brand ?? t("noScrapedYet")}</span>
          </div>
          <div className="tile" style={{ "--i": 2 } as React.CSSProperties}>
            <span className="t-label">{t("lastUpdate")}</span>
            <span className="t-value" style={{ fontSize: 18 }}>
              {pricing.fetched_at ? asDate(pricing.fetched_at).toLocaleString(numberLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
            </span>
            <span className="t-sub">{pricing.stale ? <span className="pill warn">{t("staleCheck")}</span> : t("refreshEvery")}</span>
          </div>
        </div>
      )}

      <div className="page-cols">
        <section className="pane chart-card">
          <div className="pane-title">
            <h3>{t("historyTitle")}</h3>
            <span className="row" style={{ gap: 10 }}>
              {brands.map((b) => <span key={b} className="row small" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: brandColor(b) }} />{b}</span>)}
            </span>
          </div>
          {data.length < 2 ? (
            <div className="empty-state">
              <span className="ic"><Icon name="chart" size={26} /></span>
              <span className="small">{t("historyEmpty")}</span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="x" tickLine={false} axisLine={false} minTickGap={24} fontSize={12} />
                <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} width={56} fontSize={12} tickFormatter={(v: number) => `€${v.toFixed(2)}`} />
                <Tooltip formatter={(v: number) => `€${v.toFixed(3)}`} cursor={{ stroke: "var(--faint)", strokeDasharray: "3 3" }} />
                <Legend wrapperStyle={{ display: "none" }} />
                {brands.map((b) => (
                  <Line key={b} type="monotone" dataKey={b} stroke={brandColor(b)} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} connectNulls
                    animationDuration={900} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="xsmall muted" style={{ margin: 0 }}>{t("fuelNote")}</p>
        </section>

        <aside className="pane">
          <div className="pane-title"><h3>{t("stations")}</h3><span className="badge-n">{rows.length}</span></div>
          {rows.length === 0 ? (
            <p className="small muted">{t("noScrapedYet")}</p>
          ) : (
            <div className="list list--in">
              {shownRows.map((r, i) => (
                <div key={r.id} className="fuel-row" style={{ "--i": Math.min(i, 10) } as React.CSSProperties}>
                  <span className="ic" style={{ color: brandColor(r.brand) }}><Icon name="fuel" size={20} /></span>
                  <div className="stack tight" style={{ minWidth: 0, gap: 2 }}>
                    <span className="row nowrap" style={{ minWidth: 0 }}>
                      {r.source_url ? <a href={r.source_url} target="_blank" rel="noreferrer" className="strong ellipsis">{r.brand}</a> : <b className="ellipsis">{r.brand}</b>}
                      <span className={`pill ${r.fuel_type === "DD" ? "info" : ""}`}>{r.fuel_type === "DD" ? t("ddDiesel") : r.fuel_type}</span>
                    </span>
                    <span className="xsmall muted ellipsis" title={r.location}>{r.location?.slice(0, 120) || "—"}</span>
                    <span className="xsmall faint">{asDate(r.fetched_at).toLocaleString(numberLocale(), { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  <span className="fuel-price">€{r.price_eur_l.toFixed(3)}</span>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
