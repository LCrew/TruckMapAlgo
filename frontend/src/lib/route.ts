import type { PlanResult } from "./api";

type LL = [number, number];

/**
 * Visit number for every stop: consecutive stops at the same place are one visit.
 * 0 = still at the start depot (loading there before departure), so it gets no number of its own.
 */
export function visitNumbers(stops: PlanResult["stops"]): number[] {
  const out: number[] = [];
  let v = 0;
  stops.forEach((s, i) => {
    const p = stops[i - 1];
    if (p && (Math.abs(p.lat - s.lat) > 1e-5 || Math.abs(p.lon - s.lon) > 1e-5)) v++;
    out.push(v);
  });
  return out;
}

const STEP_M = 40; // resample spacing
const CELL = 0.0006; // grid cell in degrees: ~65 m north–south, ~35 m east–west at 57°N
const MIN_SHARED = 10; // samples (~400 m) before two legs count as sharing a road

interface Sample { lat: number; lon: number; dx: number; dy: number }

function resample(shape: LL[]): Sample[] {
  const out: Sample[] = [];
  let carry = 0;
  for (let i = 1; i < shape.length; i++) {
    const [la, lo] = shape[i - 1], [lb, lob] = shape[i];
    const k = Math.cos((la * Math.PI) / 180);
    const dy = (lb - la) * 111_320, dx = (lob - lo) * 111_320 * k;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    let s = carry;
    for (; s < len; s += STEP_M) {
      const f = s / len;
      out.push({ lat: la + (lb - la) * f, lon: lo + (lob - lo) * f, dx: dx / len, dy: dy / len });
    }
    carry = s - len;
  }
  return out;
}

const cellOf = (lat: number, lon: number) => [Math.floor(lat / CELL), Math.floor(lon / (CELL * 2))];

/**
 * Pixel offset (to the right of the direction of travel) for every leg, so legs that run along the same
 * road stay visible: opposite directions end up as two lanes side by side, repeated same-direction legs
 * get their own outer lane. Legs that share no road with another leg stay on the road centre (0).
 */
export function legOffsets(shapes: LL[][], lanePx = 4.5): number[] {
  const samples = shapes.map(resample);
  const grid = new Map<string, { leg: number; dx: number; dy: number }[]>();
  samples.forEach((pts, leg) => pts.forEach((p) => {
    const [a, b] = cellOf(p.lat, p.lon);
    const key = `${a}:${b}`;
    const list = grid.get(key) ?? [];
    if (!list.some((e) => e.leg === leg)) list.push({ leg, dx: p.dx, dy: p.dy });
    grid.set(key, list);
  }));

  const n = shapes.length;
  const same = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const opp = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  samples.forEach((pts, i) => pts.forEach((p) => {
    const [a, b] = cellOf(p.lat, p.lon);
    const hit = new Map<number, number>(); // other leg → direction agreement
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      for (const e of grid.get(`${a + da}:${b + db}`) ?? []) {
        if (e.leg !== i && !hit.has(e.leg)) hit.set(e.leg, e.dx * p.dx + e.dy * p.dy);
      }
    }
    hit.forEach((dot, j) => { if (dot >= 0) same[i][j]++; else opp[i][j]++; });
  }));

  const lane = new Array<number>(n).fill(0);
  const shared = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (same[i][j] >= MIN_SHARED || opp[i][j] >= MIN_SHARED) shared[i] = true;
      if (j < i && same[i][j] >= MIN_SHARED) lane[i] = Math.max(lane[i], lane[j] + 1);
    }
  }
  return lane.map((l, i) => (shared[i] ? lanePx * (1 + 2 * l) : 0));
}
