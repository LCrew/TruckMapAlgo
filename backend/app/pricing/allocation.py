"""Split a run's total cost between the orders on it.

Each order's weight = effective LDM × km carried, where
  effective LDM = max(LDM, volume / m³-per-LDM), and
  km carried    = km the order is actually on board, capped at its direct
                  pickup→delivery distance (so an order is never charged for
                  detours the truck makes to serve other orders).
An order that occupies more of the trailer, for longer, pays more; one dropped
early pays less. Stop handling time is charged directly to the order that caused it.
Empty running (positioning, return) and unused capacity are either spread by the
same shares (default: the run is fully recovered) or reported as a separate line.
Finally no order pays more than it would cost to ship alone (its standalone cost);
any excess is redistributed to the other orders by share.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class AllocLeg:
    distance_km: float
    on_board: dict[int, float]  # order_id -> effective LDM


def effective_ldm(ldm: float, volume_m3: float, weight_kg: float, truck) -> float:
    m3_per_ldm = truck.volume_m3 / truck.ldm_capacity if truck.ldm_capacity else 6.6
    eff = max(ldm or 0.0, (volume_m3 or 0.0) / m3_per_ldm)
    if eff <= 0 and weight_kg and truck.max_payload_t:
        # only weight known: translate into equivalent trailer length
        eff = weight_kg / 1000.0 / truck.max_payload_t * truck.ldm_capacity
    return eff


def _cap_at_standalone(alloc: dict[int, float], caps: dict[int, float], shares: dict[int, float]) -> dict[int, float]:
    """Water-filling: clamp orders above their cap, hand the excess to uncapped orders by share."""
    alloc = dict(alloc)
    capped: set[int] = set()
    for _ in range(len(alloc)):
        excess = 0.0
        for oid, v in alloc.items():
            cap = caps.get(oid)
            if cap is not None and oid not in capped and v > cap + 1e-9:
                excess += v - cap
                alloc[oid] = cap
                capped.add(oid)
        if excess <= 1e-9:
            break
        free = [oid for oid in alloc if oid not in capped]
        wsum = sum(shares[oid] for oid in free)
        if not free or wsum <= 0:  # everyone capped: combining costs more than shipping alone
            total_cap = sum(caps[o] for o in alloc) or 1.0
            for oid in alloc:
                alloc[oid] += excess * caps[oid] / total_cap
            break
        for oid in free:
            alloc[oid] += excess * shares[oid] / wsum
    return alloc


def allocate(
    legs: list[AllocLeg],
    order_ids: list[int],
    total_cost: float,
    handling_cost: dict[int, float],
    capacity_ldm: float,
    unused_separately: bool = False,
    km_cap: dict[int, float] | None = None,
    standalone_cost: dict[int, float] | None = None,
) -> dict:
    """handling_cost: per-order direct cost (already including margin); part of total_cost.
    km_cap: per-order direct pickup→delivery km. standalone_cost: per-order solo price cap."""
    km_on = {oid: 0.0 for oid in order_ids}
    eff = {oid: 0.0 for oid in order_ids}
    total_leg_km = 0.0
    for leg in legs:
        total_leg_km += leg.distance_km
        for oid, e in leg.on_board.items():
            if oid in km_on:
                km_on[oid] += leg.distance_km
                eff[oid] = e
    counted = {oid: min(km_on[oid], km_cap[oid]) if km_cap and km_cap.get(oid) else km_on[oid] for oid in order_ids}
    weights = {oid: eff[oid] * counted[oid] for oid in order_ids}

    direct = {oid: handling_cost.get(oid, 0.0) for oid in order_ids}
    shared = max(total_cost - sum(direct.values()), 0.0)
    wsum = sum(weights.values())

    if wsum <= 0:
        shares = {oid: 1.0 / len(order_ids) for oid in order_ids} if order_ids else {}
    else:
        shares = {oid: w / wsum for oid, w in weights.items()}

    unused_cost = 0.0
    utilization = None
    if capacity_ldm > 0 and total_leg_km > 0:
        used = sum(eff[oid] * km_on[oid] for oid in order_ids)
        utilization = min(used / (capacity_ldm * total_leg_km), 1.0)
    if unused_separately and utilization is not None and wsum > 0:
        alloc_shared = {oid: shared * utilization * shares[oid] for oid in order_ids}
        unused_cost = shared - sum(alloc_shared.values())
    else:
        alloc_shared = {oid: shared * shares[oid] for oid in order_ids}

    totals = {oid: direct[oid] + alloc_shared[oid] for oid in order_ids}
    if standalone_cost:
        totals = _cap_at_standalone(totals, standalone_cost, shares)

    per_order = {
        oid: {
            "share": round(shares[oid], 6),
            "ldm_km": round(weights[oid], 2),
            "km_counted": round(counted[oid], 1),
            "direct_cost": round(direct[oid], 2),
            "shared_cost": round(totals[oid] - direct[oid], 2),
            "allocated_cost": round(totals[oid], 2),
            "cost_share": round(totals[oid] / total_cost, 6) if total_cost else 0.0,
        }
        for oid in order_ids
    }
    return {
        "orders": per_order,
        "utilization": None if utilization is None else round(utilization, 4),
        "unused_capacity_cost": round(unused_cost, 2),
    }
