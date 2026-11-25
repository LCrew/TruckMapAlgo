import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";

export interface RouteLeg {
  shape: [number, number][];
  color: string;
  /** px to the right of the direction of travel (0 = road centre), see legOffsets() */
  offset: number;
  /** tooltip HTML (already escaped) */
  tooltip: string;
}

/** Shift a projected line `off` px to the right of its direction of travel (mitred joins, clamped at 2×). */
function offsetRing(pts: L.Point[], off: number): L.Point[] {
  const p = L.LineUtil.simplify(pts, 1);
  if (!off || p.length < 2) return p;
  const n: [number, number][] = [];
  for (let i = 0; i < p.length - 1; i++) {
    const dx = p[i + 1].x - p[i].x, dy = p[i + 1].y - p[i].y, len = Math.hypot(dx, dy) || 1;
    n.push([-dy / len, dx / len]); // screen y points down, so this is the right-hand side
  }
  return p.map((pt, i) => {
    const a = n[Math.max(0, i - 1)], b = n[Math.min(n.length - 1, i)];
    let mx = a[0] + b[0], my = a[1] + b[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-6) [mx, my] = b; else { mx /= ml; my /= ml; }
    const k = off / Math.max(0.5, mx * a[0] + my * a[1]);
    return L.point(pt.x + mx * k, pt.y + my * k);
  });
}

/** Polyline drawn with a constant screen offset, so it keeps its lane at every zoom level. */
type OffsetOptions = L.PolylineOptions & { offset?: number };
const OffsetLine: new (latlngs: L.LatLngExpression[], options: OffsetOptions) => L.Polyline =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (L.Polyline as any).extend({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _project(this: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L.Polyline.prototype as any)._project.call(this);
      const off = this.options.offset || 0;
      if (!off) return;
      this._rings = this._rings.map((r: L.Point[]) => offsetRing(r, off));
      const b = L.bounds([]);
      this._rings.forEach((r: L.Point[]) => r.forEach((pt) => b.extend(pt)));
      if (b.isValid()) { this._rawPxBounds = b; this._updateBounds(); }
    },
  });

const ARROW_GAP = 150; // px between direction arrows

function arrowIcon(color: string, deg: number) {
  return L.divIcon({
    className: "route-arrow",
    html: `<span style="background:${color}"><svg viewBox="0 0 12 12" style="transform:rotate(${deg.toFixed(1)}deg)"><path d="M4.5 2.75 7.75 6 4.5 9.25"/></svg></span>`,
    iconSize: [16, 16],
  });
}

/** Points along a projected line where a direction arrow goes, with the travel angle in degrees. */
function arrowSpots(ring: L.Point[]) {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < ring.length; i++) { const d = ring[i].distanceTo(ring[i - 1]); seg.push(d); total += d; }
  if (total < 70) return [];
  const at: number[] = [];
  if (total < ARROW_GAP * 1.5) at.push(total / 2);
  else for (let s = ARROW_GAP / 2; s < total - 45; s += ARROW_GAP) at.push(s);
  const out: { p: L.Point; deg: number }[] = [];
  let i = 0, run = 0;
  for (const s of at) {
    while (i < seg.length - 1 && run + seg[i] < s) run += seg[i++];
    const f = seg[i] ? (s - run) / seg[i] : 0;
    const a = ring[i], b = ring[i + 1];
    out.push({ p: L.point(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f), deg: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });
  }
  return out;
}

/**
 * The planned route: one casing + coloured line per leg, offset into lanes where legs share a road,
 * with direction arrows. Hovering a leg (or `highlight` from outside) brings it forward and dims the rest.
 */
export default function RouteLayer({ legs, highlight, onHover }: {
  legs: RouteLeg[];
  highlight?: number | null;
  onHover?: (i: number | null) => void;
}) {
  const map = useMap();
  const [hover, setHover] = useState<number | null>(null);
  const layers = useRef<{ casing: L.Polyline; line: L.Polyline }[]>([]);
  const arrows = useRef<L.LayerGroup | null>(null);
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const active = hover ?? highlight ?? null;
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    const casings = legs.map((l) => new OffsetLine(l.shape, {
      offset: l.offset, className: "leg-casing", color: "#fff", weight: 9, opacity: 1, lineCap: "round", lineJoin: "round", interactive: false,
    }).addTo(map));
    const lines = legs.map((l, i) => {
      const line = new OffsetLine(l.shape, { offset: l.offset, color: l.color, weight: 5, opacity: 1, lineCap: "round", lineJoin: "round" });
      line.bindTooltip(l.tooltip, { sticky: true });
      line.on("mouseover", () => { setHover(i); onHoverRef.current?.(i); });
      line.on("mouseout", () => { setHover(null); onHoverRef.current?.(null); });
      return line.addTo(map);
    });
    layers.current = lines.map((line, i) => ({ casing: casings[i], line }));
    const group = L.layerGroup().addTo(map);
    arrows.current = group;

    const drawArrows = () => {
      group.clearLayers();
      const size = map.getSize();
      const view = L.bounds(map.containerPointToLayerPoint([-40, -40]), map.containerPointToLayerPoint([size.x + 40, size.y + 40]));
      legs.forEach((l, i) => {
        const ring = offsetRing(l.shape.map((ll) => map.latLngToLayerPoint(ll)), l.offset);
        for (const a of arrowSpots(ring)) {
          if (!view.contains(a.p)) continue;
          const m = L.marker(map.layerPointToLatLng(a.p), { icon: arrowIcon(l.color, a.deg), interactive: false, keyboard: false, zIndexOffset: -500 });
          (m.options as L.MarkerOptions & { leg: number }).leg = i;
          group.addLayer(m);
        }
      });
      paint(activeRef.current);
    };
    drawArrows();
    map.on("zoomend moveend", drawArrows);
    return () => {
      map.off("zoomend moveend", drawArrows);
      [...casings, ...lines, group].forEach((x) => x.remove());
      layers.current = [];
      arrows.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, legs]);

  function paint(a: number | null) {
    layers.current.forEach(({ casing, line }, i) => {
      const dim = a != null && a !== i;
      line.setStyle({ opacity: dim ? 0.28 : 1, weight: a === i ? 7 : 5 });
      casing.setStyle({ opacity: dim ? 0.4 : 1, weight: a === i ? 11 : 9 });
    });
    if (a != null) { layers.current[a]?.casing.bringToFront(); layers.current[a]?.line.bringToFront(); }
    arrows.current?.eachLayer((m) => {
      const leg = ((m as L.Marker).options as L.MarkerOptions & { leg: number }).leg;
      (m as L.Marker).getElement()?.classList.toggle("dim", a != null && a !== leg);
    });
  }

  useEffect(() => { paint(active); });

  return null;
}
