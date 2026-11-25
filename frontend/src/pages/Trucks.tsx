import { useEffect, useState } from "react";
import Icon from "../components/Icon";
import { ConfirmButton, Field, FileButton, Spinner, Toggle, useToast } from "../components/ui";
import { api, Compartment, num, tentsOf, Truck, truckLabel } from "../lib/api";
import { Key, translate, useI18n } from "../lib/i18n";
import { flash } from "../lib/motion";

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
type Spec = [NumKey, Key, number, string];
const DIMENSIONS: Spec[] = [
  ["height_m", "fHeight", 0.05, "m"], ["width_m", "fWidth", 0.05, "m"], ["length_m", "fLength", 0.1, "m"],
  ["empty_weight_t", "fEmpty", 0.1, "t"], ["max_payload_t", "fPayload", 0.1, "t"],
  ["axle_count", "fAxles", 1, ""], ["axle_load_t", "fAxleLoad", 0.1, "t"],
];
const FUEL: Spec[] = [["consumption_empty_l100", "fL100Empty", 0.5, "L"], ["consumption_full_l100", "fL100Full", 0.5, "L"]];
const COSTS: Spec[] = [["wear_eur_per_km", "fWear", 0.01, "€"], ["fixed_eur_per_day", "fFixed", 1, "€"], ["driver_hourly_rate", "fDriver", 0.5, "€"]];
const CSV_COLUMNS =
  "name,plate,trailer_plate,height_m,width_m,length_m,empty_weight_t,max_payload_t,axle_count,axle_load_t,consumption_empty_l100,consumption_full_l100,emission_class,tent1_name,tent1_ldm,tent1_m3,tent1_payload_t,tent2_name,tent2_ldm,tent2_m3,tent2_payload_t";

function NumFields({ d, specs, onChange, nullable, cols = "grid4" }: {
  d: Truck; specs: Spec[]; onChange: (t: Truck) => void; nullable?: boolean; cols?: string;
}) {
  const { t } = useI18n();
  return (
    <div className={cols}>
      {specs.map(([k, label, step]) => (
        <Field key={k} label={t(label)}>
          <input type="number" step={step} inputMode="decimal" value={(d[k] as number | null) ?? ""} placeholder={nullable ? t("global") : undefined}
            onChange={(e) => onChange({ ...d, [k]: e.target.value === "" ? (nullable ? null : 0) : +e.target.value })} />
        </Field>
      ))}
    </div>
  );
}

function TruckCard({ unit, index, onSaved, onRemoved, onDuplicate }: {
  unit: Truck; index: number; onSaved: (t: Truck) => void; onRemoved: () => void; onDuplicate: (t: Truck) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [d, setD] = useState<Truck>(unit);
  const [open, setOpen] = useState(!unit.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isNew = !unit.id;
  const dirty = isNew || JSON.stringify(d) !== JSON.stringify(unit);
  const tents = tentsOf(d);
  const setTents = (c: Compartment[]) =>
    setD({ ...d, compartments_json: JSON.stringify(c), ldm_capacity: c.reduce((a, x) => a + x.ldm, 0), volume_m3: c.reduce((a, x) => a + x.volume_m3, 0) });
  const setTent = (i: number, p: Partial<Compartment>) => setTents(tents.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const tentPayload = tents.reduce((a, x) => a + x.max_payload_t, 0);

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const r = d.id ? await api.updateTruck(d.id, d) : await api.createTruck(d);
      setD(r);
      onSaved(r);
      toast(t("unitSaved", { name: r.name }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (active: boolean) => {
    setD((x) => ({ ...x, active }));
    if (!d.id) return;
    try {
      await api.updateTruck(d.id, { active });
      onSaved({ ...unit, active });
    } catch (e) {
      setD((x) => ({ ...x, active: !active }));
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (d.id) {
      try {
        await api.deleteTruck(d.id);
      } catch (e) {
        return setError((e as Error).message);
      }
    }
    onRemoved();
  };

  return (
    <article className={`card truck-card ${open ? "on" : ""}`} data-key={unit.id ?? `new-${index}`} style={{ "--i": Math.min(index, 10) } as React.CSSProperties}>
      <div className="tc-head" onClick={() => setOpen(!open)} role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), setOpen(!open))}>
        <span className={`ic ${d.active ? "dk" : ""}`}><Icon name="truck" size={22} /></span>
        <div className="grow stack tight" style={{ minWidth: 0 }}>
          <span className="row nowrap" style={{ minWidth: 0 }}>
            <b className="ellipsis">{d.name || t("unitName")}</b>
            {isNew && <span className="pill info">{t("newBadge")}</span>}
            {!isNew && dirty && <span className="pill warn">{t("unsaved")}</span>}
          </span>
          <span className="small muted ellipsis">
            {[d.plate, d.trailer_plate].filter(Boolean).join(" + ") || "—"} · {num(d.ldm_capacity, 1)} LDM · {num(Math.min(tentPayload, d.max_payload_t), 1)} t · {tents.length > 1 ? t("tentN", { n: tents.length }) : t("tent1", { n: 1 })} · {d.emission_class.replace("_", " ")}
          </span>
        </div>
        <span onClick={(e) => e.stopPropagation()} className="row nowrap">
          <Toggle small checked={d.active} onChange={toggleActive}><span className="small hide-phone">{t(d.active ? "available" : "unavailable")}</span></Toggle>
        </span>
        <span className={`fold-ic ${open ? "open" : ""}`}><Icon name="chevron" size={20} /></span>
      </div>

      {open && (
        <div className="tc-body">
          <div className="grid4">
            <Field label={t("unitName")} className="span2"><input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
            <Field label={t("truckPlate")}><input value={d.plate} placeholder="AB-1234" onChange={(e) => setD({ ...d, plate: e.target.value })} /></Field>
            <Field label={t("trailerPlate")}><input value={d.trailer_plate} placeholder={t("optional")} onChange={(e) => setD({ ...d, trailer_plate: e.target.value })} /></Field>
          </div>

          <div className="stack">
            <div className="spread">
              <span className="label">{t("compartments")}</span>
              <div className="row">
                <button className="chip sm" onClick={() => setTents(semi())}>{t("presetSemi")}</button>
                <button className="chip sm" onClick={() => setTents(twoTents())}>{t("presetTwo")}</button>
              </div>
            </div>
            <div className="stack tight">
              <div className="tent-row head"><span>{t("colTent")}</span><span>{t("colLoadingM")}</span><span>{t("colVolumeM3")}</span><span>{t("colMaxLoadT")}</span><span /></div>
              {tents.map((c, i) => (
                <div key={i} className="tent-row">
                  <input className="sm" value={c.name} aria-label={t("colTent")} onChange={(e) => setTent(i, { name: e.target.value })} />
                  <input className="sm right" type="number" step="0.1" aria-label={t("colLoadingM")} value={c.ldm} onChange={(e) => setTent(i, { ldm: +e.target.value })} />
                  <input className="sm right" type="number" step="1" aria-label={t("colVolumeM3")} value={c.volume_m3} onChange={(e) => setTent(i, { volume_m3: +e.target.value })} />
                  <input className="sm right" type="number" step="0.5" aria-label={t("colMaxLoadT")} value={c.max_payload_t} onChange={(e) => setTent(i, { max_payload_t: +e.target.value })} />
                  <button className="icon-btn sm" disabled={tents.length < 2} title={t("remove")} aria-label={t("remove")}
                    onClick={() => setTents(tents.filter((_, j) => j !== i))}><Icon name="x" size={16} /></button>
                </div>
              ))}
            </div>
            <div className="spread">
              <button className="btn small ghost" onClick={() => setTents([...tents, { name: t("tentName", { n: tents.length + 1 }), ldm: 7.7, volume_m3: 55, max_payload_t: 10 }])}>
                <Icon name="plus" size={16} />{t("addTent")}
              </button>
              <span className="kv">{t("unitTotal")} <b>{num(d.ldm_capacity, 1)} LDM</b><b>{num(d.volume_m3, 0)} m³</b><b>{num(Math.min(tentPayload, d.max_payload_t), 1)} t</b></span>
            </div>
            {tentPayload > d.max_payload_t + 1e-6 && <span className="xsmall muted">{t("payloadLimited", { a: tentPayload, b: d.max_payload_t })}</span>}
          </div>

          <div className="stack">
            <span className="label">{t("vehicleRouter")}</span>
            <NumFields d={d} specs={DIMENSIONS} onChange={setD} />
            <Field label={t("emissionClass")}>
              <div className="seg" role="group" aria-label={t("emissionClass")}>
                {["EURO_VI", "EURO_V", "EURO_IV"].map((c) => (
                  <button key={c} className={d.emission_class === c ? "on" : ""} aria-pressed={d.emission_class === c} onClick={() => setD({ ...d, emission_class: c })}>
                    {c.replace("_", " ")}
                  </button>
                ))}
              </div>
            </Field>
            <span className="xsmall muted">{t("gvwNote", { g: (d.empty_weight_t + d.max_payload_t).toFixed(1) })}</span>
          </div>

          <div className="grid2" style={{ alignItems: "start" }}>
            <div className="stack">
              <span className="label">{t("fuelRating")}</span>
              <NumFields d={d} specs={FUEL} onChange={setD} cols="grid2" />
            </div>
            <div className="stack">
              <span className="label">{t("costOverrides")}</span>
              <NumFields d={d} specs={COSTS} onChange={setD} nullable cols="grid3" />
            </div>
          </div>

          {error && <div className="alert error"><Icon name="alert" size={18} /><span>{error}</span></div>}

          <div className="spread">
            <div className="row">
              {!isNew && (
                <button className="btn small ghost" onClick={() => onDuplicate(d)}><Icon name="copy" size={16} />{t("duplicate")}</button>
              )}
              <ConfirmButton className="btn small ghost danger" icon="trash" label={isNew ? t("discard") : t("delete")} title={t("delete")} onConfirm={remove} />
            </div>
            <div className="row">
              {!isNew && dirty && <button className="btn small" onClick={() => setD(unit)}>{t("discard")}</button>}
              <button className="btn primary" onClick={save} disabled={busy || !dirty}>
                {busy ? <Spinner /> : <Icon name="save" size={18} />}{t("saveUnit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

export default function Trucks() {
  const { t } = useI18n();
  const toast = useToast();
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [drafts, setDrafts] = useState<{ key: number; unit: Truck }[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = () => api.trucks().then((x) => { setTrucks(x); setLoaded(true); }).catch((e) => setError((e as Error).message));
  useEffect(() => { load(); }, []);

  const active = trucks.filter((x) => x.active).length;

  const addDraft = (unit: Truck) => {
    const key = Date.now();
    setDrafts((prev) => [{ key, unit }, ...prev]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const importFleet = async (f: File) => {
    setError("");
    try {
      const r = await api.importTrucks(f);
      toast(t("fleetImported", { c: r.created, u: r.updated }));
      load();
    } catch (e) {
      setError(t("importFailed", { e: (e as Error).message }));
    }
  };

  const onSaved = (saved: Truck, draftKey?: number) => {
    if (draftKey !== undefined) {
      setDrafts((prev) => prev.filter((x) => x.key !== draftKey));
      setTrucks((prev) => [...prev, saved]);
      setTimeout(() => flash(document.querySelector(`.truck-card[data-key="${saved.id}"]`)), 60);
    } else {
      setTrucks((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">{t("tab.Trucks")}<span>{t("fleetSub", { n: trucks.length, a: active })}</span></h1>
        <div className="row">
          <FileButton accept=".csv,text/csv" onFile={importFleet}><Icon name="upload" size={18} />{t("importCsv")}</FileButton>
          <button className="btn primary" onClick={() => addDraft(newTruck())}><Icon name="plus" size={18} />{t("addUnit")}</button>
        </div>
      </div>

      {error && <div className="alert error"><Icon name="alert" size={18} /><span>{error}</span></div>}

      <div className="list list--in">
        {drafts.map((x, i) => (
          <TruckCard key={`new-${x.key}`} unit={x.unit} index={i}
            onSaved={(s) => onSaved(s, x.key)} onRemoved={() => setDrafts((prev) => prev.filter((y) => y.key !== x.key))} onDuplicate={addDraft} />
        ))}
        {trucks.map((x, i) => (
          <TruckCard key={x.id} unit={x} index={drafts.length + i} onSaved={(s) => onSaved(s)}
            onRemoved={() => { setTrucks((prev) => prev.filter((y) => y.id !== x.id)); toast(t("unitDeleted", { name: truckLabel(x) })); }}
            onDuplicate={(src) => addDraft({ ...src, id: undefined, plate: "", trailer_plate: "", name: `${src.name} ${t("copySuffix")}` })} />
        ))}
        {loaded && trucks.length + drafts.length === 0 && (
          <div className="pane">
            <div className="empty-state">
              <span className="ic"><Icon name="truck" size={26} /></span>
              <span className="strong" style={{ color: "var(--ink)" }}>{t("noTrucks")}</span>
              <button className="btn primary small" onClick={() => addDraft(newTruck())}><Icon name="plus" size={16} />{t("addUnit")}</button>
            </div>
          </div>
        )}
      </div>

      <details className="disclosure">
        <summary><span className="row small muted"><Icon name="info" size={18} />{t("csvFormat")}</span><span className="fold-ic"><Icon name="chevron" size={18} /></span></summary>
        <code className="mono xsmall muted" style={{ wordBreak: "break-all" }}>{CSV_COLUMNS}</code>
        <p className="small muted" style={{ margin: 0 }}>{t("fleetCsvNote")}</p>
      </details>
    </div>
  );
}
