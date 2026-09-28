"""Run cost model: fuel + driver + tolls + wear + fixed + margin."""
from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class LegInput:
    distance_km: float
    duration_h: float
    payload_t: float  # weight on board during this leg
    km_by_country: dict[str, float] = field(default_factory=dict)


@dataclass
class TruckParams:
    max_payload_t: float
    consumption_empty_l100: float
    consumption_full_l100: float
    emission_class: str = "EURO_VI"
    wear_eur_per_km: float | None = None
    fixed_eur_per_day: float | None = None
    driver_hourly_rate: float | None = None


def consumption_l100(truck: TruckParams, payload_t: float) -> float:
    """Linear interpolation between empty and fully-loaded consumption by weight load factor."""
    lf = 0.0 if truck.max_payload_t <= 0 else min(max(payload_t / truck.max_payload_t, 0.0), 1.0)
    return truck.consumption_empty_l100 + (truck.consumption_full_l100 - truck.consumption_empty_l100) * lf


def net_fuel_price(pump_price: float, settings: dict) -> float:
    if settings.get("exclude_vat_from_cost", True) and settings.get("fuel_prices_include_vat", True):
        return pump_price / (1 + settings.get("vat_rate", 0.21))
    return pump_price


def time_budget(drive_h: float, n_stops: int, settings: dict) -> dict:
    handling_h = n_stops * settings["handling_minutes_per_stop"] / 60.0
    breaks_h = math.floor(drive_h / 4.5) * settings["break_minutes_per_4_5h"] / 60.0
    work_h = drive_h + handling_h + breaks_h
    days = max(1, math.ceil(drive_h / settings["max_driving_hours_per_day"] - 1e-9), math.ceil(work_h / 13.0 - 1e-9))
    return {"drive_h": drive_h, "handling_h": handling_h, "breaks_h": breaks_h, "work_h": work_h, "days": days}


def toll_cost(km_by_country: dict[str, float], days: int, emission_class: str, settings: dict) -> dict[str, float]:
    total_km = sum(km_by_country.values()) or 1.0
    out: dict[str, float] = {}
    for cc, km in km_by_country.items():
        cfg = settings["tolls"].get(cc)
        if not cfg or km < 0.5:
            continue
        rate = cfg["rates"].get(emission_class) or max(cfg["rates"].values())
        if cfg["type"] == "per_km":
            out[cc] = rate * km
        else:  # per_day vignette: days attributable to this country, at least one
            out[cc] = rate * max(1, math.ceil(days * km / total_km - 1e-9))
    return out


def run_cost(
    legs: list[LegInput],
    n_stops: int,
    truck: TruckParams,
    pump_fuel_price: float,
    settings: dict,
    default_country: str = "LV",
) -> dict:
    fuel_price = net_fuel_price(pump_fuel_price, settings)
    km = sum(l.distance_km for l in legs)
    drive_h = sum(l.duration_h for l in legs)
    fuel_l = sum(l.distance_km * consumption_l100(truck, l.payload_t) / 100.0 for l in legs)

    tb = time_budget(drive_h, n_stops, settings)
    hourly = truck.driver_hourly_rate if truck.driver_hourly_rate is not None else settings["driver_hourly_rate"]
    wear_rate = truck.wear_eur_per_km if truck.wear_eur_per_km is not None else settings["wear_eur_per_km"]
    fixed_rate = truck.fixed_eur_per_day if truck.fixed_eur_per_day is not None else settings["fixed_eur_per_day"]

    km_by_country: dict[str, float] = {}
    for l in legs:
        src = l.km_by_country or {default_country: l.distance_km}
        for cc, v in src.items():
            km_by_country[cc] = km_by_country.get(cc, 0.0) + v
    tolls = toll_cost(km_by_country, tb["days"], truck.emission_class, settings)

    components = {
        "fuel": fuel_l * fuel_price,
        "driver": tb["work_h"] * hourly + tb["days"] * settings.get("driver_per_diem", 0.0),
        "tolls": sum(tolls.values()),
        "wear": km * wear_rate,
        "fixed": tb["days"] * fixed_rate,
    }
    subtotal = sum(components.values())
    margin = subtotal * settings["margin_pct"] / 100.0
    return {
        "components": {k: round(v, 2) for k, v in components.items()},
        "subtotal": round(subtotal, 2),
        "margin": round(margin, 2),
        "total": round(subtotal + margin, 2),
        "tolls_by_country": {k: round(v, 2) for k, v in tolls.items()},
        "km_by_country": {k: round(v, 1) for k, v in km_by_country.items()},
        "distance_km": round(km, 1),
        "fuel_litres": round(fuel_l, 1),
        "fuel_price_net": round(fuel_price, 4),
        "fuel_price_pump": round(pump_fuel_price, 3),
        "driver_hourly_rate": hourly,
        **{k: round(v, 2) if isinstance(v, float) else v for k, v in tb.items()},
    }
