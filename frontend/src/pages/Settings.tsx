import { useEffect, useState } from "react";
import AddressInput from "../components/AddressInput";
import { api, Settings as S } from "../lib/api";
import { Key, useI18n } from "../lib/i18n";

const NUMS: [string, number][] = [
  ["driver_hourly_rate", 0.5], ["driver_per_diem", 1], ["handling_minutes_per_stop", 5],
  ["max_driving_hours_per_day", 0.5], ["break_minutes_per_4_5h", 5], ["wear_eur_per_km", 0.01],
  ["fixed_eur_per_day", 5], ["margin_pct", 0.5], ["vat_rate", 0.01], ["fuel_manual_price", 0.001],
];

export default function Settings({ onSaved }: { onSaved: (s: S) => void }) {
  const { t } = useI18n();
  const [s, setS] = useState<S | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api.settings().then(setS); }, []);
  if (!s) return null;

  const save = async () => {
    const r = await api.saveSettings(s);
    setS(r);
    onSaved(r);
    setMsg(t("saved"));
    setTimeout(() => setMsg(""), 1500);
  };
  const setToll = (cc: string, cls: string, v: number) =>
    setS({ ...s, tolls: { ...s.tolls, [cc]: { ...s.tolls[cc], rates: { ...s.tolls[cc].rates, [cls]: v } } } });

  return (
    <div className="page">
      <div className="page-inner">
        <div className="spread"><h2>{t("tab.Settings")}</h2>
          <div className="row">{msg && <span className="tag good">{msg}</span>}<button className="btn primary" onClick={save}>{t("saveSettings")}</button></div></div>

        <div className="card">
          <h3>{t("depotTitle")}</h3>
          <AddressInput value={s.depot.address} onChange={(v) => setS({ ...s, depot: { ...s.depot, address: v } })}
            onSelect={(h) => setS({ ...s, depot: { address: h.display_name, lat: h.lat, lon: h.lon } })} />
          <div className="muted small mono">{s.depot.lat.toFixed(6)}, {s.depot.lon.toFixed(6)}</div>
          <div className="row">
            <label className="row small"><input type="checkbox" checked={s.return_to_depot}
              onChange={(e) => setS({ ...s, return_to_depot: e.target.checked })} /> {t("returnToDepot")}</label>
            <button className="btn ghost" onClick={() => setS({ ...s, depot: { address: "Spodrības iela 1, Dobele, LV-3701, Latvija", lat: 56.6265654, lon: 23.3006995 } })}>
              {t("resetDobele")}</button>
          </div>
        </div>

        <div className="card">
          <h3>{t("fuelSource")}</h3>
          <div className="grid3">
            <label className="field">{t("modeField")}
              <select value={s.fuel_price_mode} onChange={(e) => setS({ ...s, fuel_price_mode: e.target.value })}>
                <option value="min">{t("modeMin")}</option>
                <option value="avg">{t("modeAvg")}</option>
                <option value="brand">{t("modeBrand")}</option>
                <option value="manual">{t("modeManual")}</option>
              </select></label>
            <label className="field">{t("brand")}
              <select value={s.fuel_brand} disabled={s.fuel_price_mode !== "brand"} onChange={(e) => setS({ ...s, fuel_brand: e.target.value })}>
                <option>Circle K</option><option>Virši</option><option>Viada</option>
              </select></label>
            <label className="row small" style={{ alignSelf: "end" }}><input type="checkbox" checked={s.exclude_vat_from_cost}
              onChange={(e) => setS({ ...s, exclude_vat_from_cost: e.target.checked })} /> {t("excludeVat")}</label>
          </div>
        </div>

        <div className="card">
          <h3>{t("costParams")}</h3>
          <div className="grid4">
            {NUMS.map(([k, step]) => (
              <label className="field" key={k}>{t(`s.${k}` as Key)}
                <input type="number" step={step} value={s[k]} onChange={(e) => setS({ ...s, [k]: +e.target.value })} /></label>
            ))}
          </div>
          <label className="row small"><input type="checkbox" checked={s.show_unused_capacity_separately}
            onChange={(e) => setS({ ...s, show_unused_capacity_separately: e.target.checked })} />
            {t("unusedSeparately")}</label>
        </div>

        <div className="card">
          <h3>{t("tollsTitle")}</h3>
          <table className="data">
            <thead><tr><th>{t("colCountry")}</th><th>{t("colType")}</th><th className="num">EURO VI</th><th className="num">EURO V</th><th className="num">EURO IV</th></tr></thead>
            <tbody>
              {Object.entries(s.tolls as Record<string, { type: string; rates: Record<string, number> }>).map(([cc, toll]) => (
                <tr key={cc}>
                  <td><b>{cc}</b></td>
                  <td>
                    <select value={toll.type} onChange={(e) => setS({ ...s, tolls: { ...s.tolls, [cc]: { ...toll, type: e.target.value } } })}>
                      <option value="per_day">{t("perDay")}</option>
                      <option value="per_km">{t("perKmToll")}</option>
                    </select>
                  </td>
                  {["EURO_VI", "EURO_V", "EURO_IV"].map((cls) => (
                    <td key={cls} className="num"><input type="number" step="0.01" style={{ width: 90, textAlign: "right" }}
                      value={toll.rates[cls]} onChange={(e) => setToll(cc, cls, +e.target.value)} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted small">{t("tollsNote")}</div>
        </div>
      </div>
    </div>
  );
}
