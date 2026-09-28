"""Plans a run: geocode, build the truck-legal matrix, optimize the stop order,
route each leg with the real on-board weight, then cost and allocate per order."""
from __future__ import annotations

import json
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlmodel import Session, select

from .db import load_settings
from .i18n import AppError, msg, tr
from .fleet import LoadItem, compartments, effective_payload_t, loading_plan, spec_key, unit_label
from .fuel.service import pricing_diesel_price
from .models import Order, PriceSample, Run, Truck
from .pricing import predictor
from .pricing.allocation import AllocLeg, allocate, effective_ldm
from .pricing.cost_model import LegInput, TruckParams, consumption_l100, net_fuel_price, run_cost
from .routing import geocode
from .routing.optimizer import OptOrder, optimize
from .routing.valhalla import NoRouteError, TruckProfile, ValhallaError, get_client


class PlanningError(AppError):
    status_code = 422


# A small vehicle that ignores practically all HGV restrictions: used as the baseline
# to show how much distance the real truck's restrictions add.
UNRESTRICTED = dict(height_m=2.0, width_m=1.9, length_m=5.0, gross_weight_t=3.0, axle_load_t=1.5, axle_count=2)


def truck_params(t: Truck) -> TruckParams:
    return TruckParams(
        max_payload_t=t.max_payload_t,
        consumption_empty_l100=t.consumption_empty_l100,
        consumption_full_l100=t.consumption_full_l100,
        emission_class=t.emission_class,
        wear_eur_per_km=t.wear_eur_per_km,
        fixed_eur_per_day=t.fixed_eur_per_day,
        driver_hourly_rate=t.driver_hourly_rate,
    )


def truck_profile(t: Truck, payload_t: float, hazmat: bool) -> TruckProfile:
    return TruckProfile(
        height_m=t.height_m, width_m=t.width_m, length_m=t.length_m,
        gross_weight_t=t.empty_weight_t + max(payload_t, 0.0),
        axle_load_t=t.axle_load_t, axle_count=t.axle_count, hazmat=hazmat,
    )


def ensure_coords(s: Session, orders: list[Order]) -> None:
    missing = []
    for o in orders:
        if o.delivery_lat is None or o.delivery_lon is None:
            hit = geocode.geocode(s, o.delivery_address) if o.delivery_address else None
            if not hit:
                missing.append(f"#{o.id} delivery '{o.delivery_address}'")
                continue
            o.delivery_lat, o.delivery_lon = hit["lat"], hit["lon"]
        if o.pickup_address and (o.pickup_lat is None or o.pickup_lon is None):
            hit = geocode.geocode(s, o.pickup_address)
            if not hit:
                missing.append(f"#{o.id} pickup '{o.pickup_address}'")
                continue
            o.pickup_lat, o.pickup_lon = hit["lat"], hit["lon"]
        s.add(o)
    s.commit()
    if missing:
        raise PlanningError("geocode_failed", items="; ".join(missing))


def _last_country(km_by_country: dict[str, float]) -> str | None:
    keys = [k for k, v in km_by_country.items() if v > 0.05]
    return keys[-1] if keys else None


@dataclass
class PlanContext:
    """Inputs shared by every truck planned for the same set of orders."""

    settings: dict
    orders: list[Order]  # detached snapshots with coordinates
    fuel: dict
    route_cache: dict = field(default_factory=dict)
    matrix_cache: dict = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)


def prepare(s: Session, order_ids: list[int]) -> PlanContext:
    settings = load_settings(s)
    orders = [o for o in (s.get(Order, i) for i in order_ids) if o]
    if not orders:
        raise PlanningError("no_orders")
    ensure_coords(s, orders)
    # detached copies, safe to use from worker threads; getattr (not model_dump) reloads the
    # attributes the commit in ensure_coords expired
    snaps = [Order(**{f: getattr(o, f) for f in Order.model_fields}) for o in orders]
    return PlanContext(settings=settings, orders=snaps, fuel=pricing_diesel_price(s, settings))


def _cached(ctx: PlanContext, cache: dict, key, fn):
    with ctx.lock:
        if key in cache:
            return cache[key]
    val = fn()
    with ctx.lock:
        cache[key] = val
    return val


def plan_for_truck(ctx: PlanContext, truck: Truck, detailed: bool = True) -> dict:
    """Plan the context's orders on one fleet unit. detailed=False skips the restriction-detour
    comparison (used when ranking the whole fleet)."""
    settings, fuel = ctx.settings, ctx.fuel
    depot = (settings["depot"]["lat"], settings["depot"]["lon"])
    return_to_depot = bool(settings["return_to_depot"])
    tp = truck_params(truck)
    payload_cap = effective_payload_t(truck)
    comps = compartments(truck)
    warnings: list[str] = []
    unserved: list[dict] = []

    # Orders that can never fit this unit
    eff = {o.id: effective_ldm(o.ldm, o.volume_m3, o.weight_kg, truck) for o in ctx.orders}
    orders = []
    for o in ctx.orders:
        if o.weight_kg / 1000 > payload_cap + 1e-6 or eff[o.id] > truck.ldm_capacity + 1e-6 \
                or o.volume_m3 > truck.volume_m3 + 1e-6:
            unserved.append({"id": o.id, "reason_key": "exceeds_capacity", "reason": tr("en", "exceeds_capacity")})
        else:
            orders.append(o)
    if not orders:
        raise PlanningError("none_fit_truck")

    # ---- nodes & truck-legal matrix (profile at the heaviest possible load: conservative)
    coords: list[tuple[float, float]] = [depot]
    opt_orders: list[OptOrder] = []
    for o in orders:
        pickup = (o.pickup_lat, o.pickup_lon) if o.pickup_lat is not None else depot
        coords.append(pickup)
        coords.append((o.delivery_lat, o.delivery_lon))
        opt_orders.append(OptOrder(o.id, len(coords) - 2, len(coords) - 1,
                                   eff[o.id], o.weight_kg, o.volume_m3))
    uniq: list[tuple[float, float]] = []
    node_to_u: list[int] = []
    for c in coords:
        key = (round(c[0], 6), round(c[1], 6))
        if key not in uniq:
            uniq.append(key)
        node_to_u.append(uniq.index(key))

    max_payload = min(payload_cap, sum(o.weight_kg for o in orders) / 1000)
    any_hazmat = any(o.hazmat for o in orders)
    client = get_client()
    mprofile = truck_profile(truck, max_payload, any_hazmat)
    try:
        du, tu = _cached(ctx, ctx.matrix_cache, (tuple(uniq), json.dumps(mprofile.costing_options())),
                         lambda: client.matrix(uniq, mprofile))
    except NoRouteError as e:
        raise PlanningError("location_unreachable", detail=str(e)) from e
    dist = [[du[node_to_u[i]][node_to_u[j]] for j in range(len(coords))] for i in range(len(coords))]
    dur = [[tu[node_to_u[i]][node_to_u[j]] for j in range(len(coords))] for i in range(len(coords))]

    fuel_net = net_fuel_price(fuel["price"], settings)
    avg_cons = (truck.consumption_empty_l100 + truck.consumption_full_l100) / 2
    wear = truck.wear_eur_per_km if truck.wear_eur_per_km is not None else settings["wear_eur_per_km"]
    hourly = truck.driver_hourly_rate if truck.driver_hourly_rate is not None else settings["driver_hourly_rate"]
    res = optimize(dist, dur, opt_orders, truck.ldm_capacity, payload_cap * 1000, truck.volume_m3,
                   eur_per_km=fuel_net * avg_cons / 100 + wear, eur_per_hour=hourly,
                   return_to_depot=return_to_depot)
    for oid in res.unserved:
        unserved.append({"id": oid, "reason_key": "no_route_to_order", "reason": tr("en", "no_route_to_order")})
    served = [o for o in orders if o.id not in res.unserved]
    by_id = {o.id: o for o in served}
    if not served:
        raise PlanningError("no_legal_route_any")

    # ---- walk the sequence and route every leg with the real on-board weight
    seq = [x for x in res.sequence if x[1] != "end"]
    node_coord = lambda n: coords[n]  # noqa: E731
    on_board: dict[int, Order] = {}
    stops, legs, cost_legs, alloc_legs = [], [], [], []
    load_start: dict[int, int] = {}
    load_items: list[LoadItem] = []
    for i, (node, kind, oid) in enumerate(seq):
        if kind == "pickup":
            on_board[oid] = by_id[oid]
            load_start[oid] = i
        elif kind == "delivery":
            on_board.pop(oid, None)
            o = by_id[oid]
            load_items.append(LoadItem(oid, load_start[oid], i, eff[oid], o.volume_m3, o.weight_kg / 1000))
        load_kg = sum(o.weight_kg for o in on_board.values())
        load_ldm = sum(eff[o.id] for o in on_board.values())
        c = node_coord(node)
        o = by_id.get(oid) if oid else None
        stops.append({
            "seq": i, "kind": kind, "order_id": oid, "lat": c[0], "lon": c[1],
            "label": "Depot" if kind == "depot" else (
                (o.pickup_address or settings["depot"]["address"]) if kind == "pickup" else o.delivery_address),
            "reference": o.reference if o else None,
            "load_kg_after": round(load_kg, 1), "load_ldm_after": round(load_ldm, 2),
        })
        if i == len(seq) - 1:
            break
        nxt = node_coord(seq[i + 1][0])
        payload_t = load_kg / 1000
        hazmat = any(x.hazmat for x in on_board.values())
        if (round(c[0], 6), round(c[1], 6)) == (round(nxt[0], 6), round(nxt[1], 6)):
            continue  # same place (e.g. loading several orders at the depot)
        profile = truck_profile(truck, payload_t, hazmat)
        rkey = (c, nxt, json.dumps(profile.costing_options()))
        try:
            rl = _cached(ctx, ctx.route_cache, rkey, lambda: client.route(c, nxt, profile))
        except NoRouteError as e:
            raise PlanningError("no_legal_route_leg", leg=i, tons=f"{payload_t:.1f}", detail=str(e)) from e
        baseline_km = detour = None
        if detailed:
            try:
                baseline_km = _cached(ctx, ctx.route_cache, (c, nxt, "unrestricted"), lambda: client.route(
                    c, nxt, TruckProfile(**UNRESTRICTED), with_countries=False)).distance_km
            except ValhallaError:
                pass
            detour = round(rl.distance_km - baseline_km, 1) if baseline_km is not None else None
            if detour is not None and detour > 1.0:
                warnings.append(msg("restriction_detour", leg=len(legs) + 1, km=detour))
        legs.append({
            "from_seq": i, "to_seq": i + 1,
            "distance_km": round(rl.distance_km, 2), "duration_h": round(rl.duration_h, 3),
            "payload_t": round(payload_t, 2), "gross_t": round(profile.gross_weight_t, 2),
            "ldm_on_board": round(load_ldm, 2), "hazmat": hazmat,
            "orders_on_board": sorted(on_board.keys()),
            "km_by_country": rl.km_by_country, "has_toll": rl.has_toll,
            "baseline_km": baseline_km, "restriction_detour_km": detour,
            "consumption_l100": round(consumption_l100(tp, payload_t), 1),
            "shape": [[round(a, 5), round(b, 5)] for a, b in rl.shape] if detailed else [],
        })
        cost_legs.append(LegInput(rl.distance_km, rl.duration_h, payload_t, rl.km_by_country))
        alloc_legs.append(AllocLeg(rl.distance_km, {x.id: eff[x.id] for x in on_board.values()}))

    n_stops = sum(1 for st in stops if st["kind"] in ("pickup", "delivery"))
    cost = run_cost(cost_legs, n_stops, tp, fuel["price"], settings)

    # ---- which tent each order travels in
    loading = loading_plan(comps, load_items, len(stops))
    for ref in loading["split_orders"]:
        o = by_id[ref]
        warnings.append(msg("order_split", ref=o.reference or f"#{o.id}"))
    warnings.extend(loading["warnings"])

    # ---- standalone cost: each order shipped alone (depot -> pickup -> delivery [-> depot])
    depot_node = 0
    standalone: dict[int, float] = {}
    direct_km: dict[int, float] = {}
    km_on: dict[int, float] = {}
    for o in served:
        opt = next(x for x in opt_orders if x.order_id == o.id)
        km_on[o.id] = sum(l["distance_km"] for l in legs if o.id in l["orders_on_board"])
        direct_km[o.id] = dist[opt.pickup_node][opt.delivery_node] or km_on[o.id]
        countries: dict[str, float] = {}
        for l in legs:
            if o.id in l["orders_on_board"]:
                for cc, v in l["km_by_country"].items():
                    countries[cc] = countries.get(cc, 0.0) + v
        tot_c = sum(countries.values()) or 1.0
        sa_legs = []
        path = [(depot_node, opt.pickup_node, 0.0), (opt.pickup_node, opt.delivery_node, o.weight_kg / 1000)]
        if return_to_depot:
            path.append((opt.delivery_node, depot_node, 0.0))
        for a, b, pl in path:
            d, t = dist[a][b] or 0.0, dur[a][b] or 0.0
            kbc = {cc: d * v / tot_c for cc, v in countries.items()} if pl > 0 else {}
            sa_legs.append(LegInput(d, t, pl, kbc))
        standalone[o.id] = run_cost(sa_legs, 2, tp, fuel["price"], settings)["total"]

    margin_mult = 1 + settings["margin_pct"] / 100
    handling_each = settings["handling_minutes_per_stop"] / 60 * hourly * margin_mult
    handling = {o.id: 2 * handling_each for o in served}
    alloc = allocate(alloc_legs, [o.id for o in served], cost["total"], handling, truck.ldm_capacity,
                     unused_separately=bool(settings["show_unused_capacity_separately"]),
                     km_cap=direct_km, standalone_cost=standalone)

    # ---- per-order rows & price prediction
    order_rows = []
    now = datetime.now(timezone.utc)
    tent_of = {o["order_id"]: [] for c in loading["compartments"] for o in c["orders"]}
    for c in loading["compartments"]:
        for o in c["orders"]:
            tent_of[o["order_id"]].append(c["name"] if o["fraction"] >= 0.999 else f"{c['name']} {o['fraction']:.0%}")
    for o in served:
        a = alloc["orders"][o.id]
        dest_country = None
        for l in legs:
            if l["to_seq"] < len(stops) and stops[l["to_seq"]]["order_id"] == o.id \
                    and stops[l["to_seq"]]["kind"] == "delivery":
                dest_country = _last_country(l["km_by_country"])
        features = {
            "date": now.isoformat(), "km_on_board": km_on[o.id], "eff_ldm": eff[o.id], "weight_kg": o.weight_kg,
            "share": a["share"], "dest_lat": o.delivery_lat, "dest_lon": o.delivery_lon,
            "dest_country": dest_country or "LV", "fuel_price": fuel["price"], "co_loaded": len(served),
            "standalone_cost": standalone[o.id], "cost_price": a["allocated_cost"],
        }
        order_rows.append({
            "id": o.id, "reference": o.reference, "customer": o.customer,
            "pickup": o.pickup_address or "Depot", "delivery": o.delivery_address,
            "ldm": o.ldm, "volume_m3": o.volume_m3, "weight_kg": o.weight_kg, "hazmat": o.hazmat,
            "eff_ldm": round(eff[o.id], 2), "km_on_board": round(km_on[o.id], 1),
            "direct_km": round(direct_km[o.id], 1),
            "tent": ", ".join(tent_of.get(o.id, [])),
            **a,
            "standalone_cost": standalone[o.id],
            "savings": round(standalone[o.id] - a["allocated_cost"], 2),
            "prediction": predictor.predict(features),
            "features": features,
        })

    return {
        "truck": {**truck.model_dump(), "label": unit_label(truck), "effective_payload_t": payload_cap},
        "depot": settings["depot"],
        "return_to_depot": return_to_depot,
        "fuel": fuel,
        "stops": stops,
        "legs": legs,
        "cost": cost,
        "allocation": {"utilization": alloc["utilization"], "unused_capacity_cost": alloc["unused_capacity_cost"]},
        "loading": loading,
        "orders": order_rows,
        "unserved": unserved,
        "warnings": warnings + ([msg("fuel_stale", source=fuel.get("source", ""))] if fuel.get("stale") else []),
        "created_at": now.isoformat(),
    }


def count_trips(stops: list[dict], depot: dict) -> int:
    """1 + number of times the truck comes back to the depot to reload after delivering."""
    trips, delivered_since_depot = 1, False
    for st in stops[1:]:
        at_depot = abs(st["lat"] - depot["lat"]) < 1e-5 and abs(st["lon"] - depot["lon"]) < 1e-5
        if st["kind"] == "delivery":
            delivered_since_depot = True
        elif st["kind"] == "pickup" and at_depot and delivered_since_depot:
            trips += 1
            delivered_since_depot = False
    return trips


def save_run(s: Session, result: dict, truck: Truck, name: str = "") -> dict:
    now = datetime.now(timezone.utc)
    cost = result["cost"]
    run = Run(truck_id=truck.id, name=name or f"Run {now:%Y-%m-%d %H:%M} · {unit_label(truck)}",
              total_km=cost["distance_km"], total_cost=cost["total"], fuel_price=result["fuel"]["price"],
              result_json=json.dumps(result))
    s.add(run)
    s.commit()
    s.refresh(run)
    for row in result["orders"]:
        o = s.get(Order, row["id"])
        o.run_id, o.status = run.id, "planned"
        o.share, o.allocated_cost = row["share"], row["allocated_cost"]
        o.standalone_cost, o.km_on_board = row["standalone_cost"], row["km_on_board"]
        o.predicted_price = row["prediction"]["price"]
        s.add(o)
    s.commit()
    result["run_id"] = run.id
    return result


def plan_run(s: Session, order_ids: list[int], truck_id: int, save: bool = False, name: str = "") -> dict:
    truck = s.get(Truck, truck_id)
    if not truck:
        raise PlanningError("truck_not_found", status_code=404, id=truck_id)
    result = plan_for_truck(prepare(s, order_ids), truck)
    return save_run(s, result, truck, name) if save else result


def compare_fleet(s: Session, order_ids: list[int], truck_ids: list[int] | None = None, lang: str = "en") -> dict:
    """Plan the orders on every available unit and rank them: all orders served first, then cost."""
    q = select(Truck).where(Truck.active == True)  # noqa: E712
    trucks = s.exec(q).all() if not truck_ids else [t for t in (s.get(Truck, i) for i in truck_ids) if t]
    if not trucks:
        raise PlanningError("no_available_trucks")
    ctx = prepare(s, order_ids)
    groups: dict[tuple, list[Truck]] = {}
    for t in trucks:  # identical units plan identically: plan each spec once
        groups.setdefault(spec_key(t), []).append(t)

    def run(group: list[Truck]) -> list[dict]:
        t = group[0]
        try:
            r = plan_for_truck(ctx, t, detailed=False)
            summary = {
                "ok": True,
                "total_cost": r["cost"]["total"],
                "distance_km": r["cost"]["distance_km"],
                "drive_h": r["cost"]["drive_h"],
                "days": r["cost"]["days"],
                "fuel_litres": r["cost"]["fuel_litres"],
                "components": r["cost"]["components"],
                "utilization": r["allocation"]["utilization"],
                "served": len(r["orders"]),
                "unserved": [{**u, "reason": tr(lang, u["reason_key"])} for u in r["unserved"]],
                "split_orders": len(r["loading"]["split_orders"]),
                "trips": count_trips(r["stops"], r["depot"]),
            }
        except PlanningError as e:
            summary = {"ok": False, "error": tr(lang, e.key, **e.params), "served": 0, "unserved": [],
                       "total_cost": None}
        return [{"truck_id": u.id, "label": unit_label(u), "name": u.name, "plate": u.plate,
                 "trailer_plate": u.trailer_plate, "ldm_capacity": u.ldm_capacity,
                 "tents": len(compartments(u)), **summary} for u in group]

    with ThreadPoolExecutor(max_workers=min(4, len(groups))) as pool:
        rows = [row for rs in pool.map(run, list(groups.values())) for row in rs]

    n = len(ctx.orders)
    rows.sort(key=lambda r: (not r["ok"], n - r["served"], r["total_cost"] if r["total_cost"] is not None else 1e12))
    best = next((r for r in rows if r["ok"]), None)
    for r in rows:
        r["recommended"] = r is best
        r["extra_vs_best"] = round(r["total_cost"] - best["total_cost"], 2) \
            if best and r["ok"] and r["served"] == best["served"] else None
    return {"orders": n, "trucks": rows, "best_truck_id": best["truck_id"] if best else None}


def record_actual_price(s: Session, order: Order, actual_price: float) -> None:
    """Store the invoiced price and turn the order into a training sample."""
    order.actual_price = actual_price
    s.add(order)
    features = None
    if order.run_id:
        run = s.get(Run, order.run_id)
        if run:
            data = json.loads(run.result_json)
            features = next((r["features"] for r in data.get("orders", []) if r["id"] == order.id), None)
    if features:
        for existing in s.exec(select(PriceSample).where(PriceSample.order_id == order.id)).all():
            s.delete(existing)
        f = dict(features)
        f["date"] = datetime.fromisoformat(f["date"])
        s.add(PriceSample(order_id=order.id, actual_price=actual_price, **f))
    s.commit()
