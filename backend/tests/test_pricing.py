import pytest

from app.config import DEFAULT_SETTINGS
from app.pricing.allocation import AllocLeg, allocate, effective_ldm
from app.pricing.cost_model import LegInput, TruckParams, consumption_l100, run_cost, time_budget, toll_cost


class T:  # minimal truck stand-in
    ldm_capacity, volume_m3, max_payload_t = 13.6, 90.0, 24.0


TRUCK = TruckParams(max_payload_t=24, consumption_empty_l100=23, consumption_full_l100=33)


def test_consumption_interpolation():
    assert consumption_l100(TRUCK, 0) == 23
    assert consumption_l100(TRUCK, 24) == 33
    assert consumption_l100(TRUCK, 12) == pytest.approx(28)
    assert consumption_l100(TRUCK, 99) == 33  # clamped


def test_effective_ldm_uses_volume_when_bulkier():
    assert effective_ldm(2.0, 0, 0, T) == 2.0
    # 33 m3 on a 90 m3 / 13.6 LDM trailer ~ 4.99 LDM
    assert effective_ldm(2.0, 33, 0, T) == pytest.approx(33 / (90 / 13.6))
    # only weight known -> weight-equivalent LDM
    assert effective_ldm(0, 0, 12000, T) == pytest.approx(6.8)


def test_allocation_sums_to_total_and_early_drop_pays_less():
    # Two equal orders, A dropped after 50 km, B travels 150 km, plus 100 km empty return
    legs = [AllocLeg(50, {1: 4.0, 2: 4.0}), AllocLeg(100, {2: 4.0}), AllocLeg(100, {})]
    res = allocate(legs, [1, 2], total_cost=1000.0, handling_cost={1: 20, 2: 20}, capacity_ldm=13.6)
    o = res["orders"]
    assert sum(x["share"] for x in o.values()) == pytest.approx(1.0)
    assert sum(x["allocated_cost"] for x in o.values()) == pytest.approx(1000.0, abs=0.02)
    assert o[1]["allocated_cost"] < o[2]["allocated_cost"]
    assert o[1]["share"] == pytest.approx(0.25)  # 200 vs 600 LDM-km


def test_allocation_unused_capacity_separately():
    legs = [AllocLeg(100, {1: 6.8})]  # half the trailer
    res = allocate(legs, [1], 1000.0, {}, capacity_ldm=13.6, unused_separately=True)
    assert res["utilization"] == pytest.approx(0.5)
    assert res["orders"][1]["allocated_cost"] == pytest.approx(500)
    assert res["unused_capacity_cost"] == pytest.approx(500)


def test_time_budget_breaks_and_days():
    tb = time_budget(10.0, 4, DEFAULT_SETTINGS)
    assert tb["breaks_h"] == pytest.approx(1.5)  # two 45-min breaks
    assert tb["handling_h"] == pytest.approx(2.0)
    assert tb["days"] == 2  # 10 h driving > 9 h daily limit


def test_tolls_per_day_and_per_km():
    t = toll_cost({"LV": 100, "LT": 200}, days=1, emission_class="EURO_VI", settings=DEFAULT_SETTINGS)
    assert t["LV"] == pytest.approx(11.0)
    assert t["LT"] == pytest.approx(200 * 0.09)


def test_run_cost_components_add_up():
    legs = [LegInput(100, 1.5, 20, {"LV": 100}), LegInput(100, 1.5, 0, {"LV": 100})]
    c = run_cost(legs, 2, TRUCK, pump_fuel_price=1.815, settings=DEFAULT_SETTINGS)
    assert c["fuel_price_net"] == pytest.approx(1.5, abs=1e-3)  # VAT removed
    assert c["subtotal"] == pytest.approx(sum(c["components"].values()), abs=0.05)
    assert c["total"] == pytest.approx(c["subtotal"] * 1.15, abs=0.05)
    loaded_l = 100 * consumption_l100(TRUCK, 20) / 100
    assert c["fuel_litres"] == pytest.approx(loaded_l + 23, abs=0.1)


def test_detours_for_others_are_not_charged():
    # Order 1 rides along on a 900 km loop but its direct distance is 280 km
    legs = [AllocLeg(300, {1: 3.0, 2: 3.0}), AllocLeg(600, {1: 3.0})]
    capped = allocate(legs, [1, 2], 1000.0, {}, 13.6, km_cap={1: 280, 2: 300})
    uncapped = allocate(legs, [1, 2], 1000.0, {}, 13.6)
    assert capped["orders"][1]["km_counted"] == 280
    assert capped["orders"][1]["allocated_cost"] < uncapped["orders"][1]["allocated_cost"]


def test_no_order_pays_more_than_standalone():
    legs = [AllocLeg(100, {1: 6.0, 2: 1.0})]
    res = allocate(legs, [1, 2], 1000.0, {}, 13.6, standalone_cost={1: 600.0, 2: 900.0})
    o = res["orders"]
    assert o[1]["allocated_cost"] == pytest.approx(600.0)
    assert o[2]["allocated_cost"] == pytest.approx(400.0)
    assert o[1]["allocated_cost"] + o[2]["allocated_cost"] == pytest.approx(1000.0)
