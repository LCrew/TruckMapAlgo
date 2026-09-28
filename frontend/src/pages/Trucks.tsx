import { useEffect, useState } from "react";
import { api, Compartment, tentsOf, Truck, truckLabel } from "../lib/api";
import { Key, translate, useI18n } from "../lib/i18n";

const semi = (): Compartment[] => [{ name: translate("trailerTent"), ldm: 13.6, volume_m3: 90, max_payload_t: 24 }];
const twoTents = (): Compartment[] => [
  { name: translate("truckTent"), ldm: 7.7, volume_m3: 55, max_payload_t: 10 },
  { name: translate("trailerTent"), ldm: 7.7, volume_m3: 55, max_payload_t: 14 },
];

const newTruck = (): Truck => ({
  name: "Truck + trailer, 2 × tent", plate: "", trailer_plate: "", active: true,
  compartments_json: JSON.stringify(twoTents()),
  height_m: 4.0, width_m: 2.55, length_m: 18.75, empty_weight_t: 16, max_payload_t: 24,
  axle_count: 5, axle_load_t: 10, ldm_capacity: 15.4, volume_m3: 110, pallet_places: 38,
  consumption_empty_l100: 24, consumption_full_l100: 35, emission_class: "EURO_VI",
  wear_eur_per_km: null, fixed_eur_per_day: null, driver_hourly_rate: null,
});

type NumKey = keyof Truck;
const DIMENSIONS: [NumKey, Key, number][] = [
  ["height_m", "fHeight", 0.05], ["width_m", "fWidth", 0.05], ["length_m", "fLength", 0.1],
  ["empty_weight_t", "fEmpty", 0.1], ["max_payload_t", "fPayload", 0.1],
  ["axle_count", "fAxles", 1], ["axle_load_t", "fAxleLoad", 0.1],
];
const FUEL: [NumKey, Key, number][] = [
  ["consumption_empty_l100", "fL100Empty", 0.5], ["consumption_full_l100", "fL100Full", 0.5],
];
const COSTS: [NumKey, Key, number][] = [
  ["wear_eur_per_km", "fWear", 0.01], ["fixed_eur_per_day", "fFixed", 1], ["driver_hourly_rate", "fDriver", 0.5],
];

function NumField({ d, k, label, step, onChange, nullable }: {
  d: Truck; k: NumKey; label: string; step: number; onChange: (t: Truck) => void; nullable?: boolean;
}) {
  const { t } = useI18n();
  return (
    <label className="field">{label}
      <input type="number" step={step} value={(d[k] as number | null) ?? ""} placeholder={nullable ? t("global") : undefined}
        onChange={(e) => onChange({ ...d, [k]: e.target.value === "" ? (nullable ? null : 0) : +e.target.value })} />
    </label>
  );
}

function TruckCard({ unit, onChange, onDuplicate }: { unit: Truck; onChange: () => void; onDuplicate: (t: Truck) => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<Truck>(unit);
  const [open, setOpen] = useState(!unit.id);
  const [saved, setSaved] = useState(false);
  const tents = tentsOf(d);
  const setTents = (c: Compartment[]) =>
    setD({ ...d, compartments_json: JSON.stringify(c), ldm_capacity: c.reduce((a, x) => a + x.ldm, 0),
      volume_m3: c.reduce((a, x) => a + x.volume_m3, 0) });
  const tentPayload = tents.reduce((a, x) => a + x.max_payload_t, 0);

  const save = async () => {
    if (d.id) await api.updateTruck(d.id, d);
    else await api.createTruck(d);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    onChange();
  };
  const toggleActive = async () => {
    const next = { ...d, active: !d.active };
    setD(next);
    if (d.id) await api.updateTruck(d.id, { active: next.active });
    onChange();
  };

  return (
    <div className="card" style={{ opacity: d.active ? 1 : 0.6 }}>
      <div className="spread">
        <div className="row" style={{ flex: 1, minWidth: 0 }}>
          <button className="btn ghost" onClick={() => setOpen(!open)} aria-label="expand">{open ? "▾" : "▸"}</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{truckLabel(d)}</div>
            <div className="row small muted">
              {tents.map((c, i) => (
                <span key={i} className="tag">{c.name}: {c.ldm} LDM · {c.volume_m3} m³ · {c.max_payload_t} t</span>
              ))}
              <span className="tag">{d.consumption_empty_l100}–{d.consumption_full_l100} L/100km</span>
              <span className="tag">H {d.height_m} m · L {d.length_m} m</span>
            </div>
          </div>
        </div>
        <div className="row">
          {saved && <span className="tag good">{t("saved")}</span>}
          <label className="row small"><input type="checkbox" checked={d.active} onChange={toggleActive} /> {t("available")}</label>
          {!open && <button className="btn" onClick={() => setOpen(true)}>{t("edit")}</button>}
        </div>
      </div>

      {open && (
        <>
          <div className="grid4">
            <label className="field">{t("unitName")}<input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
            <label className="field">{t("truckPlate")}<input value={d.plate} placeholder="AB-1234" onChange={(e) => setD({ ...d, plate: e.target.value })} /></label>
            <label className="field">{t("trailerPlate")}<input value={d.trailer_plate} placeholder={t("optional")} onChange={(e) => setD({ ...d, trailer_plate: e.target.value })} /></label>
            <label className="field">{t("emissionClass")}
              <select value={d.emission_class} onChange={(e) => setD({ ...d, emission_class: e.target.value })}>
                <option>EURO_VI</option><option>EURO_V</option><option>EURO_IV</option>
              </select>
            </label>
          </div>

          <div>
            <div className="spread" style={{ marginBottom: 6 }}>
              <h3>{t("compartments")}</h3>
              <div className="row">
                <button className="btn ghost" onClick={() => setTents(semi())}>{t("presetSemi")}</button>
                <button className="btn ghost" onClick={() => setTents(twoTents())}>{t("presetTwo")}</button>
                <button className="btn" onClick={() => setTents([...tents, { name: t("tentName", { n: tents.length + 1 }), ldm: 7.7, volume_m3: 55, max_payload_t: 10 }])}>{t("addTent")}</button>
              </div>
            </div>
            <table className="data">
              <thead><tr><th>{t("colTent")}</th><th className="num">{t("colLoadingM")}</th><th className="num">{t("colVolumeM3")}</th><th className="num">{t("colMaxLoadT")}</th><th /></tr></thead>
              <tbody>
                {tents.map((c, i) => {
                  const upd = (patch: Partial<Compartment>) => setTents(tents.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={i}>
                      <td><input value={c.name} onChange={(e) => upd({ name: e.target.value })} /></td>
                      <td className="num"><input type="number" step="0.1" style={{ width: 90, textAlign: "right" }} value={c.ldm} onChange={(e) => upd({ ldm: +e.target.value })} /></td>
                      <td className="num"><input type="number" step="1" style={{ width: 90, textAlign: "right" }} value={c.volume_m3} onChange={(e) => upd({ volume_m3: +e.target.value })} /></td>
                      <td className="num"><input type="number" step="0.1" style={{ width: 90, textAlign: "right" }} value={c.max_payload_t} onChange={(e) => upd({ max_payload_t: +e.target.value })} /></td>
                      <td>{tents.length > 1 && <button className="btn ghost danger" onClick={() => setTents(tents.filter((_, j) => j !== i))}>{t("remove")}</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><td>{t("unitTotal")}</td><td className="num">{d.ldm_capacity.toFixed(1)}</td><td className="num">{d.volume_m3.toFixed(0)}</td>
                  <td className="num">{Math.min(tentPayload, d.max_payload_t).toFixed(1)}</td><td /></tr>
              </tfoot>
            </table>
            {tentPayload > d.max_payload_t + 1e-6 && (
              <div className="muted small">{t("payloadLimited", { a: tentPayload, b: d.max_payload_t })}</div>
            )}
          </div>

          <h3>{t("vehicleRouter")}</h3>
          <div className="grid4">
            {DIMENSIONS.map(([k, l, s]) => <NumField key={k} d={d} k={k} label={t(l)} step={s} onChange={setD} />)}
          </div>
          <h3>{t("fuelRating")}</h3>
          <div className="grid4">
            {FUEL.map(([k, l, s]) => <NumField key={k} d={d} k={k} label={t(l)} step={s} onChange={setD} />)}
          </div>
          <h3>{t("costOverrides")}</h3>
          <div className="grid4">
            {COSTS.map(([k, l, s]) => <NumField key={k} d={d} k={k} label={t(l)} step={s} onChange={setD} nullable />)}
          </div>
          <div className="row">
            <button className="btn primary" onClick={save}>{t("saveUnit")}</button>
            {d.id && <button className="btn" onClick={() => onDuplicate(d)}>{t("duplicate")}</button>}
            {d.id && <button className="btn danger" onClick={async () => { await api.deleteTruck(d.id!); onChange(); }}>{t("delete")}</button>}
            <span className="muted small">{t("gvwNote", { g: (d.empty_weight_t + d.max_payload_t).toFixed(1) })}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default function Trucks() {
  const { t } = useI18n();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [msg, setMsg] = useState("");
  const load = () => api.trucks().then(setTrucks);
  useEffect(() => { load(); }, []);

  const importCsv = async (f?: File) => {
    if (!f) return;
    try {
      const r = await api.importTrucks(f);
      setMsg(t("fleetImported", { c: r.created, u: r.updated }));
      load();
    } catch (e) {
      setMsg(t("importFailed", { e: (e as Error).message }));
    }
  };

  const active = trucks.filter((x) => x.active).length;
  return (
    <div className="page">
      <div className="page-inner">
        <div className="spread">
          <h2>{t("fleetTitle", { n: trucks.length, a: active })}</h2>
          <div className="row">
            <label className="btn">{t("importFleet")}
              <input type="file" accept=".csv" hidden onChange={(e) => importCsv(e.target.files?.[0])} /></label>
            <button className="btn primary" onClick={() => setTrucks([newTruck(), ...trucks])}>{t("addUnit")}</button>
          </div>
        </div>
        <div className="muted small mono">CSV: name,plate,trailer_plate,height_m,width_m,length_m,empty_weight_t,max_payload_t,axle_count,axle_load_t,
          consumption_empty_l100,consumption_full_l100,emission_class,tent1_name,tent1_ldm,tent1_m3,tent1_payload_t,tent2_name,tent2_ldm,tent2_m3,tent2_payload_t
          {" "}{t("fleetCsvNote")}</div>
        {msg && <div className="alert">{msg}</div>}
        {trucks.map((x, i) => (
          <TruckCard key={x.id ?? `new-${i}`} unit={x} onChange={load}
            onDuplicate={(src) => setTrucks([{ ...src, id: undefined, plate: "", trailer_plate: "", name: `${src.name} ${t("copySuffix")}` }, ...trucks])} />
        ))}
      </div>
    </div>
  );
}
