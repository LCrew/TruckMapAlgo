import json

import pytest

from app.fleet import Compartment, LoadItem, compartments, effective_payload_t, loading_plan, normalize_truck
from app.models import Truck
from app.planner import count_trips

TWO_TENTS = [Compartment("Truck tent", 7.7, 55, 10), Compartment("Trailer tent", 7.7, 55, 14)]


def placement(plan):
    return {o["order_id"]: (c["name"], o["fraction"]) for c in plan["compartments"] for o in c["orders"]}


def test_orders_kept_whole_in_one_tent():
    items = [LoadItem(1, 0, 3, 5.0, 30, 6), LoadItem(2, 0, 2, 4.0, 20, 5), LoadItem(3, 1, 3, 2.5, 10, 2)]
    plan = loading_plan(TWO_TENTS, items, 4)
    assert plan["split_orders"] == [] and plan["warnings"] == []
    assert all(frac == 1.0 for _, frac in placement(plan).values())
    for c in plan["compartments"]:
        assert c["peak_ldm"] <= c["ldm"] + 1e-9


def test_order_split_only_when_no_tent_has_room():
    # 10 LDM cannot fit a 7.7 LDM tent: must be split, the small one stays whole
    items = [LoadItem(1, 0, 2, 10.0, 60, 12), LoadItem(2, 0, 2, 3.0, 10, 2)]
    plan = loading_plan(TWO_TENTS, items, 3)
    assert plan["split_orders"] == [1]
    parts = [o["fraction"] for c in plan["compartments"] for o in c["orders"] if o["order_id"] == 1]
    assert sum(parts) == pytest.approx(1.0)
    assert [o["fraction"] for c in plan["compartments"] for o in c["orders"] if o["order_id"] == 2] == [1.0]


def test_tent_payload_limit_respected():
    # 12 t fits the trailer tent (14 t) but not the truck tent (10 t)
    plan = loading_plan(TWO_TENTS, [LoadItem(1, 0, 1, 2.0, 5, 12)], 2)
    assert placement(plan)[1] == ("Trailer tent", 1.0)


def test_tent_space_reused_after_delivery():
    # two 7 LDM orders one after the other can share the same tent
    items = [LoadItem(1, 0, 1, 7.0, 20, 3), LoadItem(2, 1, 2, 7.0, 20, 3)]
    plan = loading_plan([Compartment("Tent", 7.7, 55, 10)], items, 3)
    assert plan["split_orders"] == [] and plan["warnings"] == []


def test_normalize_truck_totals_and_legacy_rows():
    t = Truck(name="Jumbo", max_payload_t=24, ldm_capacity=1, volume_m3=1,
              compartments_json=json.dumps([c.__dict__ for c in TWO_TENTS]))
    normalize_truck(t)
    assert t.ldm_capacity == pytest.approx(15.4) and t.volume_m3 == pytest.approx(110)
    assert effective_payload_t(t) == 24  # combination limit (24) below tent sum (10 + 14)
    legacy = Truck(name="Old", ldm_capacity=13.6, volume_m3=90, max_payload_t=24, compartments_json="[]")
    normalize_truck(legacy)
    assert [c.ldm for c in compartments(legacy)] == [13.6]


def test_count_trips():
    depot = {"lat": 1.0, "lon": 1.0}
    st = lambda kind, lat=1.0: {"kind": kind, "lat": lat, "lon": 1.0}  # noqa: E731
    one = [st("depot"), st("pickup"), st("pickup"), st("delivery", 2), st("delivery", 3), st("depot")]
    two = [st("depot"), st("pickup"), st("delivery", 2), st("pickup"), st("delivery", 3), st("depot")]
    assert count_trips(one, depot) == 1
    assert count_trips(two, depot) == 2


def test_prepare_snapshots_survive_commit(tmp_path, monkeypatch):
    """Regression: snapshots taken after ensure_coords' commit must keep their coordinates."""
    from sqlmodel import Session, SQLModel, create_engine

    from app import planner
    from app.models import Order

    eng = create_engine(f"sqlite:///{tmp_path / 't.db'}")
    SQLModel.metadata.create_all(eng)
    with Session(eng) as s:
        s.add(Order(delivery_address="X", delivery_lat=56.9, delivery_lon=24.1, ldm=1))
        s.commit()
        monkeypatch.setattr(planner, "pricing_diesel_price", lambda s, st: {"price": 1.8})
        ctx = planner.prepare(s, [1])
    assert (ctx.orders[0].delivery_lat, ctx.orders[0].delivery_lon) == (56.9, 24.1)


def test_exact_search_avoids_greedy_split():
    # Greedy (largest first, best fit) puts B in the 10 t truck tent and C in the trailer, leaving
    # no tent with 8 t free for A -> split. Keeping all whole is possible: A -> truck, B + C -> trailer.
    items = [LoadItem(1, 0, 2, 3.0, 10, 7), LoadItem(2, 0, 2, 3.0, 10, 7), LoadItem(3, 0, 2, 2.0, 5, 8)]
    import app.fleet as fleet

    old = fleet.SEARCH_LIMIT
    try:
        fleet.SEARCH_LIMIT = 0  # greedy only: demonstrates the split the exact search avoids
        assert fleet.loading_plan(TWO_TENTS, items, 3)["split_orders"] == [3]
    finally:
        fleet.SEARCH_LIMIT = old
    plan = loading_plan(TWO_TENTS, items, 3)
    assert plan["split_orders"] == []
    assert placement(plan)[3] == ("Truck tent", 1.0)
    for c in plan["compartments"]:
        assert c["peak_weight_t"] <= c["max_payload_t"] + 1e-9
