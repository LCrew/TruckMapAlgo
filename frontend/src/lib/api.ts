import { getLang, numberLocale } from "./i18n";

export interface Compartment {
  name: string;
  ldm: number;
  volume_m3: number;
  max_payload_t: number;
}

export interface Truck {
  id?: number;
  name: string;
  plate: string;
  trailer_plate: string;
  active: boolean;
  compartments_json: string;
  height_m: number;
  width_m: number;
  length_m: number;
  empty_weight_t: number;
  max_payload_t: number;
  axle_count: number;
  axle_load_t: number;
  ldm_capacity: number;
  volume_m3: number;
  pallet_places: number;
  consumption_empty_l100: number;
  consumption_full_l100: number;
  emission_class: string;
  wear_eur_per_km: number | null;
  fixed_eur_per_day: number | null;
  driver_hourly_rate: number | null;
}

export const tentsOf = (t: Truck): Compartment[] => {
  try {
    const c = JSON.parse(t.compartments_json || "[]");
    if (Array.isArray(c) && c.length) return c;
  } catch {
    /* fall through */
  }
  return [{ name: "Tent", ldm: t.ldm_capacity, volume_m3: t.volume_m3, max_payload_t: t.max_payload_t }];
};

export const truckLabel = (t: Truck) => {
  const plates = [t.plate, t.trailer_plate].filter(Boolean).join(" + ");
  return plates ? `${plates} · ${t.name}` : t.name;
};

export interface Order {
  id?: number;
  reference: string;
  customer: string;
  pickup_address: string | null;
  pickup_lat: number | null;
  pickup_lon: number | null;
  delivery_address: string;
  delivery_lat: number | null;
  delivery_lon: number | null;
  ldm: number;
  volume_m3: number;
  weight_kg: number;
  pallets: number;
  hazmat: boolean;
  notes: string;
  status?: string;
  run_id?: number | null;
  share?: number | null;
  allocated_cost?: number | null;
  standalone_cost?: number | null;
  predicted_price?: number | null;
  km_on_board?: number | null;
  actual_price?: number | null;
  created_at?: string;
}

export interface Stop {
  seq: number;
  kind: "depot" | "pickup" | "delivery";
  order_id: number | null;
  lat: number;
  lon: number;
  label: string;
  reference: string | null;
  load_kg_after: number;
  load_ldm_after: number;
}

export interface Leg {
  from_seq: number;
  to_seq: number;
  distance_km: number;
  duration_h: number;
  payload_t: number;
  gross_t: number;
  ldm_on_board: number;
  hazmat: boolean;
  orders_on_board: number[];
  km_by_country: Record<string, number>;
  baseline_km: number | null;
  restriction_detour_km: number | null;
  consumption_l100: number;
  shape: [number, number][];
}

export interface Prediction {
  price: number;
  low: number | null;
  high: number | null;
  method: string;
}

export interface OrderResult {
  id: number;
  reference: string;
  customer: string;
  pickup: string;
  delivery: string;
  ldm: number;
  volume_m3: number;
  weight_kg: number;
  hazmat: boolean;
  eff_ldm: number;
  km_on_board: number;
  share: number;
  ldm_km: number;
  km_counted: number;
  direct_km: number;
  direct_cost: number;
  shared_cost: number;
  allocated_cost: number;
  standalone_cost: number;
  savings: number;
  tent: string;
  prediction: Prediction;
}

export interface LoadingPlan {
  compartments: (Compartment & {
    peak_ldm: number;
    peak_volume_m3: number;
    peak_weight_t: number;
    orders: { order_id: number; fraction: number }[];
  })[];
  split_orders: number[];
  warnings: string[];
}

export interface FleetOption {
  truck_id: number;
  label: string;
  name: string;
  plate: string;
  trailer_plate: string;
  ldm_capacity: number;
  tents: number;
  ok: boolean;
  error?: string;
  total_cost: number | null;
  distance_km?: number;
  drive_h?: number;
  days?: number;
  fuel_litres?: number;
  utilization?: number | null;
  served: number;
  unserved: { id: number; reason: string }[];
  split_orders?: number;
  trips?: number;
  recommended: boolean;
  extra_vs_best: number | null;
}

export interface CostResult {
  components: Record<string, number>;
  subtotal: number;
  margin: number;
  total: number;
  tolls_by_country: Record<string, number>;
  km_by_country: Record<string, number>;
  distance_km: number;
  fuel_litres: number;
  fuel_price_net: number;
  fuel_price_pump: number;
  drive_h: number;
  handling_h: number;
  breaks_h: number;
  work_h: number;
  days: number;
}

export interface FuelPricing {
  price: number;
  mode: string;
  stale: boolean;
  fetched_at?: string;
  source: string;
}

export interface PlanResult {
  run_id?: number;
  truck: Truck & { label?: string; effective_payload_t?: number };
  loading?: LoadingPlan;
  depot: { address: string; lat: number; lon: number };
  fuel: FuelPricing;
  stops: Stop[];
  legs: Leg[];
  cost: CostResult;
  allocation: { utilization: number | null; unused_capacity_cost: number };
  orders: OrderResult[];
  unserved: { id: number; reason: string }[];
  warnings: { key: string | null; params: Record<string, unknown>; text: string }[];
}

export interface GeoHit {
  lat: number;
  lon: number;
  display_name: string;
  country_code: string;
}

export interface FuelRow {
  id: number;
  brand: string;
  fuel_type: string;
  is_diesel: boolean;
  price_eur_l: number;
  location: string;
  source_url: string;
  fetched_at: string;
}

export interface Restriction {
  lat: number;
  lon: number;
  name: string;
  restrictions: string[];
  blocks: boolean;
}

export interface RestrictionResult {
  items: Restriction[];
  total: number;
  truncated: boolean;
  source: "local" | "overpass-cache";
  partial: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Settings = Record<string, any>;

async function req<T>(method: string, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const init: RequestInit = { method, headers: { "X-Lang": getLang() }, signal };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const r = await fetch(`/api${url}`, init);
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`;
    try {
      const j = await r.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  health: () => req<{ valhalla: { ok: boolean; error?: string } }>("GET", "/health"),
  settings: () => req<Settings>("GET", "/settings"),
  saveSettings: (s: Settings) => req<Settings>("PUT", "/settings", s),
  trucks: () => req<Truck[]>("GET", "/trucks"),
  createTruck: (t: Truck) => req<Truck>("POST", "/trucks", t),
  updateTruck: (id: number, t: Partial<Truck>) => req<Truck>("PUT", `/trucks/${id}`, t),
  deleteTruck: (id: number) => req("DELETE", `/trucks/${id}`),
  orders: (status?: string) => req<Order[]>("GET", `/orders${status ? `?status=${status}` : ""}`),
  createOrder: (o: Partial<Order>) => req<Order>("POST", "/orders", o),
  updateOrder: (id: number, o: Partial<Order>) => req<Order>("PUT", `/orders/${id}`, o),
  deleteOrder: (id: number) => req("DELETE", `/orders/${id}`),
  setActualPrice: (id: number, price: number | null) =>
    req<Order>("PUT", `/orders/${id}/actual-price`, { actual_price: price }),
  importOrders: (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    return req<{ imported: number }>("POST", "/orders/import", fd);
  },
  plan: (order_ids: number[], truck_id: number, save = false, name = "") =>
    req<PlanResult>("POST", "/runs/plan", { order_ids, truck_id, save, name }),
  compare: (order_ids: number[]) =>
    req<{ orders: number; trucks: FleetOption[]; best_truck_id: number | null }>("POST", "/runs/compare", { order_ids }),
  importTrucks: (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    return req<{ created: number; updated: number }>("POST", "/trucks/import", fd);
  },
  issueConfig: () =>
    req<{ enabled: boolean; repo: string; repo_url: string; new_issue_url: string }>("GET", "/issues/config"),
  createIssue: (issue: { title: string; description: string; kind: string; context: Record<string, string>; website: string }) =>
    req<{ number: number | null; url: string }>("POST", "/issues", issue),
  runs: () =>
    req<{ id: number; name: string; created_at: string; total_km: number; total_cost: number }[]>("GET", "/runs"),
  run: (id: number) => req<PlanResult & { id: number; name: string }>("GET", `/runs/${id}`),
  deleteRun: (id: number) => req("DELETE", `/runs/${id}`),
  fuelLatest: () => req<FuelRow[]>("GET", "/fuel/latest"),
  fuelPricing: () => req<FuelPricing>("GET", "/fuel/pricing"),
  fuelRefresh: () => req<{ sources_ok: string[]; errors: Record<string, string> }>("POST", "/fuel/refresh"),
  fuelHistory: (days = 90) =>
    req<{ brand: string; fuel_type: string; price: number; fetched_at: string }[]>("GET", `/fuel/history?days=${days}`),
  geocode: (q: string) => req<GeoHit[]>("GET", `/geocode/search?q=${encodeURIComponent(q)}`),
  reverse: (lat: number, lon: number) => req<GeoHit>("GET", `/geocode/reverse?lat=${lat}&lon=${lon}`),
  restrictions: (
    b: { south: number; west: number; north: number; east: number },
    truck: Truck,
    gross: number,
    signal?: AbortSignal,
  ) =>
    req<RestrictionResult>(
      "GET",
      `/restrictions?south=${b.south}&west=${b.west}&north=${b.north}&east=${b.east}` +
        `&height=${truck.height_m}&weight=${gross}&axle_load=${truck.axle_load_t}` +
        `&length=${truck.length_m}&width=${truck.width_m}`,
      undefined,
      signal,
    ),
  predictorStatus: () =>
    req<{
      trained: boolean;
      samples_available: number;
      required: number;
      cv_mae?: number | null;
      trained_at?: string;
      csv_columns: string[];
    }>("GET", "/predictor/status"),
  train: () => req<{ trained: boolean; samples: number; cv_mae?: number | null; required?: number }>(
    "POST", "/predictor/train"),
  importHistory: (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    return req<{ imported: number }>("POST", "/predictor/import", fd);
  },
};

export const eur = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `€${v.toLocaleString(numberLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
export const num = (v: number | null | undefined, digits = 1) =>
  v == null ? "—" : v.toLocaleString(numberLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const hours = (h: number) => `${Math.floor(h)}h ${Math.round((h % 1) * 60).toString().padStart(2, "0")}m`;
