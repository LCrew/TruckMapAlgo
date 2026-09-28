"""Fleet units and their tent compartments, plus the per-tent loading plan.

A unit is a fixed combination, e.g. a tractor + semi-trailer (one tent) or a truck with
its own tent body + drawbar trailer tent ([truck]-[tent]-[tent], two compartments).
The route optimizer works on the unit's total capacity; afterwards `loading_plan`
places every order into a tent for its whole time on board. An order stays in one
tent whenever any tent has room for it over that interval, and is split across tents
only when none has.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from .i18n import msg
from .models import Truck

EPS = 1e-6


@dataclass
class Compartment:
    name: str
    ldm: float
    volume_m3: float
    max_payload_t: float


def compartments(t: Truck) -> list[Compartment]:
    try:
        raw = json.loads(t.compartments_json or "[]")
    except ValueError:
        raw = []
    out = [Compartment(str(c.get("name") or f"Tent {i + 1}"), float(c.get("ldm") or 0),
                       float(c.get("volume_m3") or 0), float(c.get("max_payload_t") or 0))
           for i, c in enumerate(raw)]
    return out or [Compartment("Tent", t.ldm_capacity, t.volume_m3, t.max_payload_t)]


def normalize_truck(t: Truck) -> Truck:
    """Fill defaults for older rows and keep unit totals equal to the sum of compartments."""
    if t.plate is None:
        t.plate = ""
    if t.trailer_plate is None:
        t.trailer_plate = ""
    if t.active is None:
        t.active = True
    comps = compartments(t)
    t.compartments_json = json.dumps([c.__dict__ for c in comps], ensure_ascii=False)
    t.ldm_capacity = round(sum(c.ldm for c in comps), 3)
    t.volume_m3 = round(sum(c.volume_m3 for c in comps), 3)
    return t


def effective_payload_t(t: Truck) -> float:
    """Legal payload of the combination, limited by what the compartments may carry."""
    comp_sum = sum(c.max_payload_t for c in compartments(t))
    return min(t.max_payload_t, comp_sum) if comp_sum > 0 else t.max_payload_t


def unit_label(t: Truck) -> str:
    plates = " + ".join(p for p in (t.plate, t.trailer_plate) if p)
    return f"{t.name} ({plates})" if plates else t.name


def spec_key(t: Truck) -> tuple:
    """Units with identical specs plan identically: used to avoid re-planning duplicates."""
    return (
        t.height_m, t.width_m, t.length_m, t.empty_weight_t, t.max_payload_t, t.axle_count, t.axle_load_t,
        t.consumption_empty_l100, t.consumption_full_l100, t.emission_class, t.wear_eur_per_km,
        t.fixed_eur_per_day, t.driver_hourly_rate, t.compartments_json,
    )


# ---------------------------------------------------------------- loading plan
SEARCH_LIMIT = 20000  # backtracking nodes before falling back to the greedy splitter


def _whole_assignment(k, items, free_fraction, put) -> list[int] | None:
    """Depth-first search for one tent per order with no splits. Leaves `used` filled on success."""
    choice: list[int] = []
    budget = [SEARCH_LIMIT]

    def dfs(i: int) -> bool:
        if i == len(items):
            return True
        budget[0] -= 1
        if budget[0] < 0:
            return False
        it = items[i]
        for c in range(k):
            if free_fraction(c, it) < 1 - EPS:
                continue
            put(c, it, 1.0)
            choice.append(c)
            if dfs(i + 1):
                return True
            choice.pop()
            put(c, it, -1.0)
        return False

    return choice if dfs(0) else None

@dataclass
class LoadItem:
    order_id: int
    start: int  # stop index where it is loaded
    end: int  # stop index where it is unloaded
    ldm: float
    volume_m3: float
    weight_t: float


def loading_plan(comps: list[Compartment], items: list[LoadItem], n_stops: int) -> dict:
    """Assign each order (as fractions) to compartments over its on-board interval."""
    k = len(comps)
    # used[c][s] = (ldm, m3, t) in compartment c while travelling from stop s to s+1
    used = [[[0.0, 0.0, 0.0] for _ in range(n_stops)] for _ in range(k)]
    caps = [(c.ldm, c.volume_m3, c.max_payload_t) for c in comps]

    def free_fraction(c: int, it: LoadItem) -> float:
        """Largest share of `it` that fits compartment c over its whole interval."""
        need = (it.ldm, it.volume_m3, it.weight_t)
        f = 1.0
        for s in range(it.start, it.end):
            for d in range(3):
                if need[d] <= EPS:
                    continue
                if caps[c][d] <= EPS:  # dimension not specified for this tent: don't constrain
                    continue
                f = min(f, max(caps[c][d] - used[c][s][d], 0.0) / need[d])
        return max(f, 0.0)

    def put(c: int, it: LoadItem, frac: float):
        for s in range(it.start, it.end):
            used[c][s][0] += it.ldm * frac
            used[c][s][1] += it.volume_m3 * frac
            used[c][s][2] += it.weight_t * frac

    placement: dict[int, list[dict]] = {}
    warnings: list[str] = []
    order = sorted(items, key=lambda x: (-(x.ldm * (x.end - x.start)), x.start))  # hardest first

    # 1) exact search for an assignment that keeps every order whole
    whole = _whole_assignment(k, order, free_fraction, put)
    if whole is not None:
        for it, c in zip(order, whole):
            placement[it.order_id] = [{"compartment": c, "fraction": 1.0}]
        order = []
    else:  # reset: the greedy pass below starts from empty tents
        for c in range(k):
            for s in range(n_stops):
                used[c][s] = [0.0, 0.0, 0.0]

    # 2) greedy fallback: keep whole where possible, split the rest
    for it in order:
        fits = [(free_fraction(c, it), c) for c in range(k)]
        whole = [c for f, c in fits if f >= 1 - EPS]
        if whole:
            # best fit: the tent with the least spare LDM left over this interval
            c = min(whole, key=lambda c: min(caps[c][0] - used[c][s][0] for s in range(it.start, it.end))
                    if it.end > it.start else 0)
            put(c, it, 1.0)
            placement[it.order_id] = [{"compartment": c, "fraction": 1.0}]
            continue
        remaining, parts = 1.0, []
        for f, c in sorted(fits, reverse=True):
            if remaining <= EPS:
                break
            take = min(f, remaining)
            if take > EPS:
                put(c, it, take)
                parts.append({"compartment": c, "fraction": round(take, 4)})
                remaining -= take
        if remaining > 1e-3:
            warnings.append(msg("tent_overflow", id=it.order_id, pct=round(remaining * 100)))
        placement[it.order_id] = parts

    return {
        "compartments": [
            {
                **comps[c].__dict__,
                "peak_ldm": round(max((u[0] for u in used[c]), default=0.0), 2),
                "peak_volume_m3": round(max((u[1] for u in used[c]), default=0.0), 2),
                "peak_weight_t": round(max((u[2] for u in used[c]), default=0.0), 2),
                "orders": [
                    {"order_id": oid, "fraction": p["fraction"]}
                    for oid, parts in placement.items() for p in parts if p["compartment"] == c
                ],
            }
            for c in range(k)
        ],
        "split_orders": [oid for oid, parts in placement.items() if len(parts) > 1],
        "warnings": warnings,
    }
