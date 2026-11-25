/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { api, Order } from "../lib/api";
import { useI18n } from "../lib/i18n";
import AddressInput from "./AddressInput";
import Icon from "./Icon";
import { Field, Spinner, Toggle, Window } from "./ui";

export const EMPTY_ORDER: Partial<Order> = {
  reference: "", customer: "", pickup_address: null, pickup_lat: null, pickup_lon: null,
  delivery_address: "", delivery_lat: null, delivery_lon: null,
  ldm: 0, volume_m3: 0, weight_kg: 0, pallets: 0, hazmat: false, notes: "",
};

const EDITABLE = ["reference", "customer", "pickup_address", "pickup_lat", "pickup_lon", "delivery_address", "delivery_lat",
  "delivery_lon", "ldm", "volume_m3", "weight_kg", "pallets", "hazmat", "notes"] as const;

export type PickTarget = "pickup" | "delivery";

interface Props {
  draft: Partial<Order>;
  setDraft: (d: Partial<Order>) => void;
  onClose: () => void;
  onSaved: (o: Order, isNew: boolean) => void;
  /** when given, the address fields offer "pick on map" */
  onPick?: (target: PickTarget) => void;
}

/** Create or edit one order. The draft lives in the parent so it survives picking a point on the map. */
export default function OrderDialog({ draft, setDraft, onClose, onSaved, onPick }: Props) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isNew = draft.id == null;
  const set = (patch: Partial<Order>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    if (!draft.delivery_address?.trim()) return setError(t("deliveryRequired"));
    setBusy(true);
    setError("");
    try {
      const body = Object.fromEntries(EDITABLE.map((k) => [k, draft[k] ?? (k.endsWith("_address") || k.endsWith("_lat") || k.endsWith("_lon") ? null : "")]));
      const o = isNew ? await api.createOrder(body as Partial<Order>) : await api.updateOrder(draft.id!, body as Partial<Order>);
      onSaved(o, isNew);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const located = (lat: number | null | undefined, text: string | null | undefined) =>
    lat != null ? <span className="pill ok"><Icon name="check" size={13} stroke={2.4} />{t("located")}</span>
      : text?.trim() ? <span className="pill">{t("notLocated")}</span> : null;

  const pickBtn = (target: PickTarget) => onPick && (
    <button type="button" className="btn ghost small" style={{ minHeight: 28, padding: "0 8px" }} onClick={() => onPick(target)}>
      <Icon name="pin" size={16} />{t("pickOnMap")}
    </button>
  );

  const numField = (k: "ldm" | "volume_m3" | "weight_kg" | "pallets", label: string, step: number) => (
    <Field label={label}>
      <input type="number" inputMode="decimal" step={step} min={0} value={draft[k] || ""} placeholder="0"
        onChange={(e) => set({ [k]: e.target.value === "" ? 0 : +e.target.value })} />
    </Field>
  );

  return (
    <Window title={isNew ? t("newOrder") : t("editOrder", { ref: draft.reference || `#${draft.id}` })} onClose={onClose} width={600}
      actions={<>
        {error && <span className="small bad-ink grow">{error}</span>}
        <button type="button" className="btn" onClick={onClose}>{t("cancel")}</button>
        <button type="submit" form="order-form" className={`btn primary ${busy ? "busy" : ""}`} disabled={busy}>
          {busy && <Spinner />}{isNew ? t("addOrderBtn") : t("saveChanges")}
        </button>
      </>}>
      <form id="order-form" className="stack loose" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="grid2">
          <Field label={t("reference")}><input value={draft.reference ?? ""} placeholder="PO-1042" onChange={(e) => set({ reference: e.target.value })} /></Field>
          <Field label={t("customer")}><input value={draft.customer ?? ""} onChange={(e) => set({ customer: e.target.value })} /></Field>
        </div>

        <div className="stack">
          <Field label={<>{t("deliveryTo")} {located(draft.delivery_lat, draft.delivery_address)}</>} aside={pickBtn("delivery")}>
            <AddressInput value={draft.delivery_address ?? ""} placeholder={t("streetCity")}
              onChange={(v) => set({ delivery_address: v, delivery_lat: null, delivery_lon: null })}
              onSelect={(h) => set({ delivery_address: h.display_name, delivery_lat: h.lat, delivery_lon: h.lon })} />
          </Field>
          <Field label={<>{t("pickupFrom")} {located(draft.pickup_lat, draft.pickup_address)}</>} aside={pickBtn("pickup")}
            hint={t("pickupHint")}>
            <AddressInput value={draft.pickup_address ?? ""} placeholder={t("depot")}
              onChange={(v) => set({ pickup_address: v || null, pickup_lat: null, pickup_lon: null })}
              onSelect={(h) => set({ pickup_address: h.display_name, pickup_lat: h.lat, pickup_lon: h.lon })} />
          </Field>
        </div>

        <div className="stack">
          <span className="label">{t("cargo")}</span>
          <div className="grid4">
            {numField("ldm", "LDM", 0.1)}
            {numField("volume_m3", "m³", 0.5)}
            {numField("weight_kg", "kg", 10)}
            {numField("pallets", t("pallets"), 1)}
          </div>
          <Toggle checked={!!draft.hazmat} onChange={(v) => set({ hazmat: v })} small>{t("adr")}</Toggle>
        </div>

        <Field label={t("notes")}>
          <textarea rows={2} value={draft.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Window>
  );
}
