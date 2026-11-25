import { useEffect, useState } from "react";
import AddressInput from "../components/AddressInput";
import Icon from "../components/Icon";
import { Field, Seg, Spinner, Toggle, useToast } from "../components/ui";
import { api, Settings as SettingsT } from "../lib/api";
import { Key, useI18n } from "../lib/i18n";
import { getSurface, getTheme, setSurface, setTheme, Surface, Theme, THEMES } from "../lib/theme";

const NUMS: [string, number, string][] = [
  ["driver_hourly_rate", 0.5, "€/h"], ["driver_per_diem", 1, "€"], ["handling_minutes_per_stop", 5, "min"],
  ["max_driving_hours_per_day", 0.5, "h"], ["break_minutes_per_4_5h", 5, "min"], ["wear_eur_per_km", 0.01, "€/km"],
  ["fixed_eur_per_day", 5, "€"], ["margin_pct", 0.5, "%"], ["vat_rate", 0.01, ""], ["fuel_manual_price", 0.001, "€/L"],
];
const DOBELE = { address: "Spodrības iela 1, Dobele, LV-3701, Latvija", lat: 56.6265654, lon: 23.3006995 };
const MODES = [["min", "modeMin"], ["avg", "modeAvg"], ["brand", "modeBrand"], ["manual", "modeManual"]] as const;
const BRANDS = ["Circle K", "Virši", "Viada"];
const CLASSES = ["EURO_VI", "EURO_V", "EURO_IV"];
type Toll = { type: string; rates: Record<string, number> };

export default function Settings({ onSaved }: { onSaved: (s: SettingsT) => void }) {
  const { t, lang, setLang } = useI18n();
  const toast = useToast();
  const [saved, setSaved] = useState<SettingsT | null>(null);
  const [s, setS] = useState<SettingsT | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [surface, setSurfaceState] = useState<Surface>(getSurface());

  useEffect(() => {
    api.settings().then((r) => { setSaved(r); setS(r); }).catch((e) => setError((e as Error).message));
  }, []);

  const dirty = !!s && JSON.stringify(s) !== JSON.stringify(saved);

  // warn before leaving the page with unsaved changes
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    setError("");
    try {
      const r = await api.saveSettings(s);
      setS(r);
      setSaved(r);
      onSaved(r);
      toast(t("saved"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pickTheme = (x: Theme) => { setTheme(x); setThemeState(x); };
  const pickSurface = (x: Surface) => { setSurface(x); setSurfaceState(x); };

  const setToll = (cc: string, p: Partial<Toll>) => s && setS({ ...s, tolls: { ...s.tolls, [cc]: { ...s.tolls[cc], ...p } } });

  return (
    <div className="page" style={{ paddingBottom: dirty ? 120 : undefined }}>
      <div className="page-head">
        <h1 className="page-title">{t("tab.Settings")}<span>{t("settingsSub")}</span></h1>
      </div>

      {error && <div className="alert error"><Icon name="alert" size={18} /><span>{error}</span></div>}

      <div className="page-cols">
        <div className="stack loose">
          {s && (
            <>
              <section className="pane">
                <div className="pane-title"><h3>{t("depotTitle")}</h3><span className="ic"><Icon name="home" size={20} /></span></div>
                <Field label={t("address")} hint={<span className="mono">{s.depot.lat.toFixed(6)}, {s.depot.lon.toFixed(6)}</span>}>
                  <AddressInput value={s.depot.address} onChange={(v) => setS({ ...s, depot: { ...s.depot, address: v } })}
                    onSelect={(h) => setS({ ...s, depot: { address: h.display_name, lat: h.lat, lon: h.lon } })} />
                </Field>
                <div className="spread" style={{ flexWrap: "wrap" }}>
                  <Toggle checked={!!s.return_to_depot} onChange={(v) => setS({ ...s, return_to_depot: v })}>{t("returnToDepot")}</Toggle>
                  <button className="btn small ghost" onClick={() => setS({ ...s, depot: { ...DOBELE } })}><Icon name="refresh" size={16} />{t("resetDobele")}</button>
                </div>
              </section>

              <section className="pane">
                <div className="pane-title"><h3>{t("fuelSource")}</h3><span className="ic"><Icon name="fuel" size={20} /></span></div>
                <div className="radios" role="radiogroup" aria-label={t("modeField")}>
                  {MODES.map(([m, label]) => (
                    <label key={m}>
                      <input type="radio" name="fuel_mode" checked={s.fuel_price_mode === m} onChange={() => setS({ ...s, fuel_price_mode: m })} />
                      <span className="radio-dot" />
                      <span className="grow">{t(label)}</span>
                      {m === "brand" && s.fuel_price_mode === "brand" && (
                        <select className="sm" style={{ width: "auto" }} value={s.fuel_brand} onChange={(e) => setS({ ...s, fuel_brand: e.target.value })}>
                          {BRANDS.map((b) => <option key={b}>{b}</option>)}
                        </select>
                      )}
                      {m === "manual" && s.fuel_price_mode === "manual" && (
                        <input className="sm right" style={{ width: 110 }} type="number" step={0.001} value={s.fuel_manual_price}
                          aria-label={t("s.fuel_manual_price" as Key)} onChange={(e) => setS({ ...s, fuel_manual_price: +e.target.value })} />
                      )}
                    </label>
                  ))}
                </div>
                <Toggle checked={!!s.exclude_vat_from_cost} onChange={(v) => setS({ ...s, exclude_vat_from_cost: v })}>{t("excludeVat")}</Toggle>
              </section>

              <section className="pane">
                <div className="pane-title"><h3>{t("costParams")}</h3><span className="ic"><Icon name="euro" size={20} /></span></div>
                <div className="grid3">
                  {NUMS.filter(([k]) => k !== "fuel_manual_price").map(([k, step]) => (
                    <Field key={k} label={t(`s.${k}` as Key)}>
                      <input type="number" step={step} inputMode="decimal" value={s[k] ?? ""} onChange={(e) => setS({ ...s, [k]: e.target.value === "" ? 0 : +e.target.value })} />
                    </Field>
                  ))}
                </div>
                <Toggle checked={!!s.show_unused_capacity_separately} onChange={(v) => setS({ ...s, show_unused_capacity_separately: v })}>{t("unusedSeparately")}</Toggle>
              </section>

              <section className="pane">
                <div className="pane-title"><h3>{t("tollsTitle")}</h3><span className="ic"><Icon name="euro" size={20} /></span></div>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>{t("colCountry")}</th><th>{t("colType")}</th>
                        {CLASSES.map((c) => <th key={c} className="num">{c.replace("_", " ")}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(s.tolls as Record<string, Toll>).map(([cc, toll]) => (
                        <tr key={cc}>
                          <td><b>{cc}</b></td>
                          <td>
                            <select className="sm" value={toll.type} onChange={(e) => setToll(cc, { type: e.target.value })}>
                              <option value="per_day">{t("perDay")}</option>
                              <option value="per_km">{t("perKmToll")}</option>
                            </select>
                          </td>
                          {CLASSES.map((cls) => (
                            <td key={cls} className="num">
                              <input className="sm right" style={{ width: 92 }} type="number" step={toll.type === "per_km" ? 0.001 : 1} value={toll.rates[cls] ?? ""}
                                aria-label={`${cc} ${cls}`} onChange={(e) => setToll(cc, { rates: { ...toll.rates, [cls]: +e.target.value } })} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="xsmall muted" style={{ margin: 0 }}>{t("tollsNote")}</p>
              </section>
            </>
          )}
          {!s && !error && <div className="pane"><Spinner /></div>}
        </div>

        <aside className="pane">
          <div className="pane-title"><h3>{t("appearance")}</h3><span className="ic"><Icon name="sun" size={20} /></span></div>
          <div className="stack">
            <span className="label">{t("theme")}</span>
            <div className="theme-swatches" role="radiogroup" aria-label={t("theme")}>
              {THEMES.map((x) => (
                <button key={x.id} role="radio" aria-checked={theme === x.id} className={`swatch ${theme === x.id ? "on" : ""}`} onClick={() => pickTheme(x.id)}>
                  <i style={{ background: `linear-gradient(135deg, ${x.bg} 0 50%, ${x.ink} 50% 100%)` }}>
                    <span style={{ position: "absolute", right: 6, bottom: 6, width: 14, height: 14, borderRadius: "50%", background: x.accent }} />
                  </i>
                  {t(`theme.${x.id}` as Key)}
                </button>
              ))}
            </div>
          </div>
          <div className="stack">
            <span className="label">{t("surfaceStyle")}</span>
            <Seg full value={surface} onChange={pickSurface} label={t("surfaceStyle")}
              options={[{ value: "glass", label: t("surfaceGlass") }, { value: "solid", label: t("surfaceSolid") }]} />
          </div>
          <div className="stack">
            <span className="label">{t("language")}</span>
            <Seg full value={lang} onChange={setLang} label={t("language")}
              options={[{ value: "lv", label: "Latviešu" }, { value: "en", label: "English" }]} />
          </div>
          <p className="xsmall muted" style={{ margin: 0 }}>{t("appearanceNote")}</p>
        </aside>
      </div>

      {dirty && (
        <div className="savebar" role="region" aria-label={t("unsavedChanges")}>
          <span>{t("unsavedChanges")}</span>
          <button className="quiet" onClick={() => setS(saved)} disabled={busy}>{t("discard")}</button>
          <button onClick={save} disabled={busy}>{busy ? <Spinner size={16} /> : null}{t("saveSettings")}</button>
        </div>
      )}
    </div>
  );
}
