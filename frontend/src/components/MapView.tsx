import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { api, hours, num, Order, PlanResult, Restriction, Truck } from "../lib/api";
import { translateRestriction, useI18n } from "../lib/i18n";

const BALTIC_BOUNDS: L.LatLngBoundsExpression = [[53.8, 20.8], [59.8, 28.3]];

const depotIcon = L.divIcon({ className: "depot-icon", html: "🏭", iconSize: [28, 28] });
const stopIcon = (n: number, kind: string) =>
  L.divIcon({ className: `stop-icon ${kind}`, html: String(n), iconSize: [26, 26] });
const orderIcon = (selected: boolean) =>
  L.divIcon({
    className: "",
    html: `<div style="width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.5);background:${selected ? "#f2a900" : "#8c9197"}"></div>`,
    iconSize: [14, 14],
  });
const restrIcon = (r: Restriction) => {
  const txt = r.restrictions[0]?.match(/[\d.,]+/)?.[0] ?? "!";
  return L.divIcon({ className: `restr-icon ${r.blocks ? "" : "info"}`, html: txt, iconSize: [22, 22] });
};

/** Colour legs by gross weight: light (empty) -> dark blue (heavy). */
function legColor(payload: number, max: number) {
  const t = max > 0 ? Math.min(payload / max, 1) : 0;
  const a = [127, 179, 255], b = [11, 47, 107];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c.join(",")})`;
}

function FitTo({ plan }: { plan: PlanResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (!plan) return;
    const pts = plan.legs.flatMap((l) => l.shape);
    if (!pts.length) return;
    // the results panel shrinks the map when a plan appears: re-measure before fitting
    const t = setTimeout(() => {
      map.invalidateSize();
      map.fitBounds(L.latLngBounds(pts as L.LatLngTuple[]), { padding: [40, 40] });
    }, 60);
    return () => clearTimeout(t);
  }, [plan, map]);
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function ClickPicker({ onPick }: { onPick?: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

function RestrictionLayer({ truck, enabled, gross }: { truck: Truck | null; enabled: boolean; gross: number }) {
  const map = useMap();
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Restriction[]>([]);
  const [msg, setMsg] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inflight = useRef<AbortController>();

  const load = () => {
    clearTimeout(timer.current);
    inflight.current?.abort();
    if (!enabled || !truck) {
      setItems([]);
      return setMsg("");
    }
    if (map.getZoom() < 10) {
      setItems([]);
      return setMsg(t("zoomInRestr"));
    }
    // wait until panning/zooming settles, and cancel requests for views already left
    timer.current = setTimeout(() => {
      const b = map.getBounds();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setMsg(t("loadingRestr"));
      api
        .restrictions({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, truck, gross, ctrl.signal)
        .then((r) => {
          setItems(r.items);
          const blocking = r.items.filter((x) => x.blocks).length;
          setMsg(
            t("restrSummary", { blocking, total: r.total }) +
              (r.truncated ? t("restrTruncated", { n: r.items.length }) : "") +
              (r.partial ? t("restrPartial") : ""),
          );
        })
        .catch((e) => {
          if ((e as Error).name !== "AbortError") setMsg(String((e as Error).message ?? e));
        });
    }, 400);
  };
  useMapEvents({ moveend: load });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
    return () => {
      clearTimeout(timer.current);
      inflight.current?.abort();
    };
  }, [enabled, truck?.id, gross, lang]);
  if (!enabled) return null;
  return (
    <>
      {msg && <div className="map-hint" style={{ top: "auto", bottom: 20 }}>{msg}</div>}
      {items.map((r, i) => (
        <Marker key={i} position={[r.lat, r.lon]} icon={restrIcon(r)}>
          <Tooltip>
            <b>{r.name || t("restriction")}</b>
            <br />
            {r.restrictions.map(translateRestriction).join(" · ")}
            {r.blocks && <><br /><b style={{ color: "#c62828" }}>{t("blocksTruck")}</b></>}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

interface Props {
  depot: { lat: number; lon: number; address: string } | null;
  orders: Order[];
  selected: Set<number>;
  plan: PlanResult | null;
  truck: Truck | null;
  pickHint?: string;
  onPick?: (lat: number, lon: number) => void;
}

export default function MapView({ depot, orders, selected, plan, truck, pickHint, onPick }: Props) {
  const { t, lang } = useI18n();
  const [showRestr, setShowRestr] = useState(false);
  const maxPayload = truck?.max_payload_t ?? 24;
  const gross = useMemo(() => {
    if (!truck) return 40;
    if (plan) return Math.max(...plan.legs.map((l) => l.gross_t), truck.empty_weight_t);
    return truck.empty_weight_t + truck.max_payload_t;
  }, [plan, truck]);

  // number stops, merging consecutive stops at the same point
  const stopMarkers = useMemo(() => {
    if (!plan) return [];
    const groups: { lat: number; lon: number; idx: number[]; kinds: Set<string>; labels: string[] }[] = [];
    plan.stops.forEach((s, i) => {
      if (s.kind === "depot") return;
      const g = groups.find((x) => Math.abs(x.lat - s.lat) < 1e-5 && Math.abs(x.lon - s.lon) < 1e-5);
      const label = `${i}. ${t(s.kind === "pickup" ? "stopLoad" : "stopUnload")} ${s.reference || `#${s.order_id}`} — ${s.label}`;
      if (g) {
        g.idx.push(i);
        g.kinds.add(s.kind);
        g.labels.push(label);
      } else groups.push({ lat: s.lat, lon: s.lon, idx: [i], kinds: new Set([s.kind]), labels: [label] });
    });
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, lang]);

  return (
    <div className="map-wrap">
      <MapContainer bounds={BALTIC_BOUNDS} maxBounds={[[52.5, 18], [61, 31]]} minZoom={6} style={{ cursor: pickHint ? "crosshair" : undefined }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />
        <ClickPicker onPick={onPick} />
        <FitTo plan={plan} />
        <RestrictionLayer truck={truck} enabled={showRestr} gross={gross} />
        {depot && (
          <Marker position={[depot.lat, depot.lon]} icon={depotIcon}>
            <Tooltip>{t("depotTooltip", { addr: depot.address })}</Tooltip>
          </Marker>
        )}
        {!plan &&
          orders
            .filter((o) => o.delivery_lat != null)
            .map((o) => (
              <Marker key={o.id} position={[o.delivery_lat!, o.delivery_lon!]} icon={orderIcon(selected.has(o.id!))}>
                <Tooltip>
                  {o.reference || `#${o.id}`} · {o.customer}
                  <br />
                  {o.delivery_address}
                </Tooltip>
              </Marker>
            ))}
        {plan?.legs.map((l, i) => (
          <Polyline
            key={i}
            positions={l.shape}
            pathOptions={{ color: legColor(l.payload_t, maxPayload), weight: 5, opacity: 0.9 }}
          >
            <Tooltip sticky>
              <b>{t("legN", { n: i + 1 })}</b>: {num(l.distance_km)} km · {hours(l.duration_h)}
              <br />
              {t("onBoard", { t: num(l.payload_t, 2), ldm: num(l.ldm_on_board, 2), g: num(l.gross_t, 1) })}
              <br />
              {t("consumption", { c: num(l.consumption_l100) })}
              {l.restriction_detour_km != null && l.restriction_detour_km > 1 && (
                <>
                  <br />
                  <b>{t("detourTooltip", { km: num(l.restriction_detour_km) })}</b>
                </>
              )}
            </Tooltip>
          </Polyline>
        ))}
        {stopMarkers.map((g, i) => (
          <Marker
            key={i}
            position={[g.lat, g.lon]}
            icon={stopIcon(g.idx[0], g.kinds.size > 1 ? "" : [...g.kinds][0])}
          >
            <Popup>
              {g.labels.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {pickHint && <div className="map-hint">{pickHint}</div>}
      <div className="map-tools">
        <button className={`btn ${showRestr ? "primary" : ""}`} onClick={() => setShowRestr((v) => !v)}>
          {showRestr ? t("hideRestr") : t("showRestr")}
        </button>
        {plan && (
          <div className="legend-box">
            <div className="muted">{t("loadOnBoard")}</div>
            <div className="legend-grad" />
            <div className="spread"><span>{t("empty")}</span><span>{maxPayload} t</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
