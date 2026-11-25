import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { api, hours, num, Order, PlanResult, Restriction, Truck } from "../lib/api";
import { translateRestriction, useI18n } from "../lib/i18n";
import Icon from "./Icon";

const BALTIC_BOUNDS: L.LatLngBoundsExpression = [[53.8, 20.8], [59.8, 28.3]];

const DEPOT_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6"/></svg>';
const depotIcon = L.divIcon({ className: "depot-icon", html: DEPOT_SVG, iconSize: [30, 30] });
const stopIcon = (n: number, kind: string) => L.divIcon({ className: `stop-icon ${kind}`, html: String(n), iconSize: [28, 28] });
const orderIcon = (on: boolean, hot: boolean) =>
  L.divIcon({ className: "ord-pin", html: `<span class="ord-dot ${on ? "on" : ""} ${hot ? "hot" : ""}"></span>`, iconSize: [18, 18] });
const restrIcon = (r: Restriction) => {
  const txt = r.restrictions[0]?.match(/[\d.,]+/)?.[0] ?? "!";
  return L.divIcon({ className: `restr-icon ${r.blocks ? "" : "info"}`, html: txt, iconSize: [24, 24] });
};

// light → dark blue by how loaded the truck is on that leg (matches .legend-grad)
const STOPS = [[168, 198, 255], [60, 111, 216], [11, 47, 107]];
function legColor(payload: number, max: number) {
  const f = Math.max(0, Math.min(1, payload / Math.max(max, 0.1))) * 2;
  const i = Math.min(1, Math.floor(f));
  const k = f - i;
  const c = STOPS[i].map((a, j) => Math.round(a + (STOPS[i + 1][j] - a) * k));
  return `rgb(${c.join(",")})`;
}

/** Padding that keeps fitted content clear of the floating panes and top bar. */
function paneInsets(map: L.Map) {
  const box = map.getContainer().getBoundingClientRect();
  let left = 24, right = 24, top = 24;
  document.querySelectorAll<HTMLElement>(".float-pane").forEach((el) => {
    // Use layout offsets, not getBoundingClientRect: panes animate in with a
    // translateX and would otherwise be measured mid-slide.
    const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!parent) return;
    const left0 = parent.left + el.offsetLeft, top0 = parent.top + el.offsetTop;
    const r = { left: left0, top: top0, right: left0 + el.offsetWidth, bottom: top0 + el.offsetHeight, width: el.offsetWidth };
    const overlaps = r.width > 0 && r.bottom > box.top && r.top < box.bottom && r.right > box.left && r.left < box.right;
    if (!overlaps) return;
    if (r.left + r.width / 2 < box.left + box.width / 2) left = Math.max(left, r.right - box.left + 24);
    else right = Math.max(right, box.right - r.left + 24);
  });
  const bar = document.querySelector(".topbar")?.getBoundingClientRect();
  if (bar && bar.bottom > box.top) top = bar.bottom - box.top + 24;
  // only ignore the panes when the gap between them is too narrow to show anything
  if (box.width - left - right < 220) left = right = 24;
  return { paddingTopLeft: L.point(left, top), paddingBottomRight: L.point(right, 24) };
}

function Fitter({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (!fitKey || !points.length) return;
    const tm = setTimeout(() => {
      map.invalidateSize();
      if (points.length === 1) map.setView(points[0], 11, { animate: true });
      else map.flyToBounds(L.latLngBounds(points), { ...paneInsets(map), duration: 0.8, maxZoom: 12 });
    }, 80);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function MapGrab({ onMap }: { onMap: (m: L.Map) => void }) {
  const map = useMap();
  useEffect(() => onMap(map), [map, onMap]);
  return null;
}

function ClickPicker({ onPick }: { onPick?: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onPick?.(e.latlng.lat, e.latlng.lng) });
  return null;
}

function RestrictionLayer({ truck, enabled, gross, onMsg }: { truck: Truck | null; enabled: boolean; gross: number; onMsg: (m: string) => void }) {
  const map = useMap();
  const { t, lang } = useI18n();
  const [items, setItems] = useState<Restriction[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inflight = useRef<AbortController>();

  const load = () => {
    clearTimeout(timer.current);
    inflight.current?.abort();
    if (!enabled || !truck) {
      setItems([]);
      return onMsg("");
    }
    if (map.getZoom() < 10) {
      setItems([]);
      return onMsg(t("zoomInRestr"));
    }
    // wait until panning/zooming settles, and cancel requests for views already left
    timer.current = setTimeout(() => {
      const b = map.getBounds();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      onMsg(t("loadingRestr"));
      api
        .restrictions({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, truck, gross, ctrl.signal)
        .then((r) => {
          setItems(r.items);
          const blocking = r.items.filter((x) => x.blocks).length;
          onMsg(
            t("restrSummary", { blocking, total: r.total }) +
              (r.truncated ? t("restrTruncated", { n: r.items.length }) : "") +
              (r.partial ? t("restrPartial") : ""),
          );
        })
        .catch((e) => {
          if ((e as Error).name !== "AbortError") onMsg(String((e as Error).message ?? e));
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
      {items.map((r, i) => (
        <Marker key={i} position={[r.lat, r.lon]} icon={restrIcon(r)}>
          <Tooltip>
            <b>{r.name || t("restriction")}</b>
            <br />
            {r.restrictions.map(translateRestriction).join(" · ")}
            {r.blocks && <><br /><b className="bad-ink">{t("blocksTruck")}</b></>}
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
  hoverId?: number | null;
  plan: PlanResult | null;
  truck: Truck | null;
  picking?: boolean;
  onPick?: (lat: number, lon: number) => void;
  onToggleOrder?: (id: number) => void;
}

export default function MapView({ depot, orders, selected, hoverId, plan, truck, picking, onPick, onToggleOrder }: Props) {
  const { t, lang } = useI18n();
  const [showRestr, setShowRestr] = useState(false);
  const [restrMsg, setRestrMsg] = useState("");
  const [map, setMap] = useState<L.Map | null>(null);
  const maxPayload = plan?.truck.max_payload_t ?? truck?.max_payload_t ?? 24;
  const routeTruck = plan?.truck ?? truck;
  const gross = useMemo(() => {
    if (!routeTruck) return 40;
    if (plan) return Math.max(...plan.legs.map((l) => l.gross_t), routeTruck.empty_weight_t);
    return routeTruck.empty_weight_t + routeTruck.max_payload_t;
  }, [plan, routeTruck]);

  const located = orders.filter((o) => o.delivery_lat != null);

  // number stops, merging stops at the same point
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

  // what to fit the view to: the planned route, otherwise depot + open orders (once they load)
  const { points, fitKey } = useMemo(() => {
    if (plan) {
      const pts = plan.legs.flatMap((l) => l.shape);
      return { points: pts, fitKey: `plan:${plan.run_id ?? ""}:${plan.stops.map((s) => s.order_id).join(",")}:${plan.truck.id}` };
    }
    const pts: [number, number][] = located.map((o) => [o.delivery_lat!, o.delivery_lon!]);
    orders.forEach((o) => o.pickup_lat != null && pts.push([o.pickup_lat, o.pickup_lon!]));
    if (depot) pts.push([depot.lat, depot.lon]);
    return { points: pts, fitKey: located.length ? "orders" : "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, located.length > 0]);

  return (
    <div className={`map-wrap ${picking ? "picking" : ""}`}>
      <MapContainer bounds={BALTIC_BOUNDS} maxBounds={[[52.5, 18], [61, 31]]} minZoom={6} zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
        />
        <MapGrab onMap={setMap} />
        <ClickPicker onPick={picking ? onPick : undefined} />
        <Fitter points={points} fitKey={fitKey} />
        <RestrictionLayer truck={routeTruck} enabled={showRestr} gross={gross} onMsg={setRestrMsg} />
        {depot && (
          <Marker position={[depot.lat, depot.lon]} icon={depotIcon} zIndexOffset={-100}>
            <Tooltip>{t("depotTooltip", { addr: depot.address })}</Tooltip>
          </Marker>
        )}
        {!plan &&
          located.map((o) => {
            const on = selected.has(o.id!);
            return (
              <Marker key={o.id} position={[o.delivery_lat!, o.delivery_lon!]} icon={orderIcon(on, hoverId === o.id)}
                zIndexOffset={on ? 200 : 0}
                eventHandlers={{ click: () => !picking && onToggleOrder?.(o.id!) }}>
                <Tooltip direction="top" offset={[0, -10]}>
                  <b>{o.reference || `#${o.id}`}</b> · {o.customer}
                  <br />
                  {o.delivery_address}
                  <br />
                  <span className="muted">{num(o.ldm, 1)} LDM · {num(o.weight_kg / 1000, 1)} t · {on ? t("clickToRemove") : t("clickToAdd")}</span>
                </Tooltip>
              </Marker>
            );
          })}
        {plan?.legs.map((l, i) => (
          <Polyline key={`c${i}`} positions={l.shape} interactive={false}
            pathOptions={{ className: "leg-casing", color: "#fff", weight: 9, opacity: 1, lineCap: "round", lineJoin: "round" }} />
        ))}
        {plan?.legs.map((l, i) => (
          <Polyline key={i} positions={l.shape}
            pathOptions={{ color: legColor(l.payload_t, maxPayload), weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" }}>
            <Tooltip sticky>
              <b>{t("legN", { n: i + 1 })}</b>: {num(l.distance_km)} km · {hours(l.duration_h)}
              <br />
              {t("onBoard", { t: num(l.payload_t, 2), ldm: num(l.ldm_on_board, 2), g: num(l.gross_t, 1) })}
              <br />
              {t("consumption", { c: num(l.consumption_l100) })}
              {l.restriction_detour_km != null && l.restriction_detour_km > 1 && (
                <><br /><b>{t("detourTooltip", { km: num(l.restriction_detour_km) })}</b></>
              )}
            </Tooltip>
          </Polyline>
        ))}
        {stopMarkers.map((g, i) => (
          <Marker key={i} position={[g.lat, g.lon]} icon={stopIcon(g.idx[0], g.kinds.size > 1 ? "" : [...g.kinds][0])}>
            <Popup>{g.labels.map((l) => <div key={l}>{l}</div>)}</Popup>
          </Marker>
        ))}
      </MapContainer>

      <div className="map-tools left">
        <div className="zoom-stack">
          <button className="rb sm" onClick={() => map?.zoomIn()} aria-label={t("zoomIn")} title={t("zoomIn")}><Icon name="plus" /></button>
          <button className="rb sm" onClick={() => map?.zoomOut()} aria-label={t("zoomOut")} title={t("zoomOut")}><Icon name="minus" /></button>
        </div>
        <button className={`rb sm ${showRestr ? "dk" : ""}`} onClick={() => setShowRestr((v) => !v)} aria-pressed={showRestr}
          title={showRestr ? t("hideRestr") : t("showRestr")} aria-label={showRestr ? t("hideRestr") : t("showRestr")}>
          <Icon name="ban" />
        </button>
        {showRestr && restrMsg && <div className="map-legend">{restrMsg}</div>}
        {plan && (
          <div className="map-legend">
            <span className="muted">{t("loadOnBoard")}</span>
            <div className="legend-grad" />
            <div className="spread"><span>{t("empty")}</span><span>{maxPayload} t</span></div>
          </div>
        )}
      </div>
    </div>
  );
}
