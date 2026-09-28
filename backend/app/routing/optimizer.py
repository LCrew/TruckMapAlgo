"""Single-truck pickup & delivery optimization with OR-Tools.

Node layout: 0 = depot start, then (pickup, delivery) per order, then optionally an
open-route end node. Pickups that happen at the depot are their own nodes at the depot
coordinates, so when the load exceeds capacity the solver can plan multiple trips
(deliver, return to depot, reload).
"""
from __future__ import annotations

from dataclasses import dataclass

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

UNREACHABLE = 10**9


@dataclass
class OptOrder:
    order_id: int
    pickup_node: int
    delivery_node: int
    ldm: float
    weight_kg: float
    volume_m3: float


@dataclass
class OptResult:
    sequence: list[tuple[int, str, int | None]]  # (node, kind, order_id) kind: depot|pickup|delivery|end
    unserved: list[int]
    objective: float


def optimize(
    dist_km: list[list[float | None]],
    dur_h: list[list[float | None]],
    orders: list[OptOrder],
    capacity_ldm: float,
    capacity_kg: float,
    capacity_m3: float,
    eur_per_km: float,
    eur_per_hour: float,
    return_to_depot: bool = True,
    time_limit_s: int | None = None,
) -> OptResult:
    n = len(dist_km)
    end_node = 0
    if not return_to_depot:
        # add a virtual end node reachable at zero cost from everywhere
        end_node = n
        dist_km = [row + [0.0] for row in dist_km] + [[UNREACHABLE] * n + [0.0]]
        dur_h = [row + [0.0] for row in dur_h] + [[UNREACHABLE] * n + [0.0]]
        n += 1

    def arc_cost(i: int, j: int) -> int:
        d, t = dist_km[i][j], dur_h[i][j]
        if d is None or t is None or d >= UNREACHABLE:
            return UNREACHABLE
        return int(round((d * eur_per_km + t * eur_per_hour) * 100))  # cents

    cost = [[arc_cost(i, j) for j in range(n)] for i in range(n)]

    manager = pywrapcp.RoutingIndexManager(n, 1, [0], [end_node])
    routing = pywrapcp.RoutingModel(manager)

    def cost_cb(fi, ti):
        return cost[manager.IndexToNode(fi)][manager.IndexToNode(ti)]

    transit = routing.RegisterTransitCallback(cost_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(transit)

    # Order dimension enforces pickup-before-delivery.
    routing.AddDimension(transit, 0, 10**12, True, "Cost")
    cost_dim = routing.GetDimensionOrDie("Cost")

    demand = {"ldm": [0] * n, "kg": [0] * n, "m3": [0] * n}
    for o in orders:
        for key, val in (("ldm", o.ldm * 100), ("kg", o.weight_kg), ("m3", o.volume_m3 * 10)):
            demand[key][o.pickup_node] += int(round(val))
            demand[key][o.delivery_node] -= int(round(val))
    caps = {"ldm": capacity_ldm * 100, "kg": capacity_kg, "m3": capacity_m3 * 10}
    for key, dem in demand.items():
        cb = routing.RegisterUnaryTransitCallback(lambda idx, d=dem: d[manager.IndexToNode(idx)])
        routing.AddDimensionWithVehicleCapacity(cb, 0, [int(round(caps[key]))], True, key)

    # Dropping an order is allowed but extremely expensive: only unreachable/oversized orders get dropped.
    penalty = 10**8
    for o in orders:
        p, d = manager.NodeToIndex(o.pickup_node), manager.NodeToIndex(o.delivery_node)
        routing.AddPickupAndDelivery(p, d)
        routing.solver().Add(routing.VehicleVar(p) == routing.VehicleVar(d))
        routing.solver().Add(cost_dim.CumulVar(p) <= cost_dim.CumulVar(d))
        routing.AddDisjunction([p, d], penalty, 2)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = time_limit_s or min(30, 2 + len(orders))

    solution = routing.SolveWithParameters(params)
    if solution is None:
        raise RuntimeError("Optimizer found no feasible plan (check capacities and reachability)")

    node_kind: dict[int, tuple[str, int]] = {}
    for o in orders:
        node_kind[o.pickup_node] = ("pickup", o.order_id)
        node_kind[o.delivery_node] = ("delivery", o.order_id)

    seq: list[tuple[int, str, int | None]] = []
    idx = routing.Start(0)
    visited: set[int] = set()
    while True:
        node = manager.IndexToNode(idx)
        if routing.IsStart(idx):
            seq.append((node, "depot", None))
        elif routing.IsEnd(idx):
            seq.append((node, "depot" if return_to_depot else "end", None))
            break
        else:
            kind, oid = node_kind[node]
            seq.append((node, kind, oid))
            visited.add(oid)
        idx = solution.Value(routing.NextVar(idx))

    unserved = [o.order_id for o in orders if o.order_id not in visited]
    return OptResult(sequence=seq, unserved=unserved, objective=solution.ObjectiveValue() / 100)
