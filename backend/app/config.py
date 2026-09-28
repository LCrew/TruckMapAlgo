"""Static configuration and default business settings.

Environment variables configure infrastructure; everything in DEFAULT_SETTINGS
is editable at runtime via the Settings page (stored in the `setting` table).
"""
import os
from pathlib import Path

VALHALLA_URL = os.getenv("VALHALLA_URL", "http://localhost:8002")
DATA_DIR = Path(os.getenv("DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DATA_DIR / 'truckmap.db'}")
NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
OVERPASS_URL = os.getenv("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
# Local truck-restriction index built by valhalla/scripts/fetch_osm.sh (Overpass is only a fallback)
RESTRICTIONS_FILE = Path(os.getenv(
    "RESTRICTIONS_FILE",
    Path(__file__).resolve().parents[2] / "valhalla" / "restrictions" / "restrictions.geojsonseq"))
HTTP_USER_AGENT = os.getenv("HTTP_USER_AGENT", "TruckMapAlgo/1.0 (Baltic truck route optimizer)")
FUEL_REFRESH_HOURS = float(os.getenv("FUEL_REFRESH_HOURS", "6"))
MIN_TRAINING_SAMPLES = int(os.getenv("MIN_TRAINING_SAMPLES", "30"))
# In-app issue reporting: a fine-grained GitHub token with "Issues: read & write" on GITHUB_REPO only.
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
GITHUB_REPO = os.getenv("GITHUB_REPO", "LCrew/TruckMapAlgo")

DEFAULT_SETTINGS: dict = {
    "depot": {
        "address": "Spodrības iela 1, Dobele, LV-3701, Latvija",
        "lat": 56.6265654,
        "lon": 23.3006995,
    },
    "return_to_depot": True,
    # Fuel
    "fuel_price_mode": "min",  # min | avg | brand | manual
    "fuel_brand": "Circle K",
    "fuel_manual_price": 1.65,
    "fuel_prices_include_vat": True,  # scraped pump prices include VAT
    "vat_rate": 0.21,
    "exclude_vat_from_cost": True,  # companies reclaim VAT
    # Driver & time
    "driver_hourly_rate": 14.0,  # EUR per paid hour (gross employer cost)
    "driver_per_diem": 0.0,  # EUR per calendar day of the run
    "handling_minutes_per_stop": 30,
    "max_driving_hours_per_day": 9.0,  # EU 561/2006
    "break_minutes_per_4_5h": 45,
    # Vehicle costs
    "wear_eur_per_km": 0.12,  # tyres, maintenance, repairs
    "fixed_eur_per_day": 140.0,  # leasing, insurance, depreciation, admin
    "margin_pct": 15.0,
    # Tolls. Time-based = EUR per day while in the country; distance-based = EUR/km.
    # Approximate N3 (>12 t) rates: verify against current official tariffs.
    "tolls": {
        "LV": {"type": "per_day", "rates": {"EURO_VI": 11.0, "EURO_V": 12.0, "EURO_IV": 14.0}},
        "LT": {"type": "per_km", "rates": {"EURO_VI": 0.09, "EURO_V": 0.11, "EURO_IV": 0.14}},
        "EE": {"type": "per_day", "rates": {"EURO_VI": 9.0, "EURO_V": 11.0, "EURO_IV": 13.0}},
    },
    # Allocation
    "show_unused_capacity_separately": False,
}

DEFAULT_TRUCKS: list[dict] = [
    {
        "name": "Semi-trailer 13.6 m (40 t)", "plate": "", "trailer_plate": "",
        "height_m": 4.0, "width_m": 2.55, "length_m": 16.5,
        "empty_weight_t": 14.5, "max_payload_t": 24.0,
        "axle_count": 5, "axle_load_t": 10.0,
        "ldm_capacity": 13.6, "volume_m3": 90.0, "pallet_places": 33,
        "consumption_empty_l100": 23.0, "consumption_full_l100": 33.0,
        "emission_class": "EURO_VI",
        "compartments_json": '[{"name": "Trailer tent", "ldm": 13.6, "volume_m3": 90, "max_payload_t": 24}]',
    },
    {
        "name": "Truck + trailer, 2 × tent 7.7 m (40 t)", "plate": "", "trailer_plate": "",
        "height_m": 4.0, "width_m": 2.55, "length_m": 18.75,
        "empty_weight_t": 16.0, "max_payload_t": 24.0,
        "axle_count": 5, "axle_load_t": 10.0,
        "ldm_capacity": 15.4, "volume_m3": 110.0, "pallet_places": 38,
        "consumption_empty_l100": 24.0, "consumption_full_l100": 35.0,
        "emission_class": "EURO_VI",
        "compartments_json": '[{"name": "Truck tent", "ldm": 7.7, "volume_m3": 55, "max_payload_t": 10},'
                             ' {"name": "Trailer tent", "ldm": 7.7, "volume_m3": 55, "max_payload_t": 14}]',
    },
    {
        "name": "Rigid box truck 7.2 m (18 t)", "plate": "", "trailer_plate": "",
        "height_m": 3.6, "width_m": 2.55, "length_m": 9.5,
        "empty_weight_t": 8.0, "max_payload_t": 10.0,
        "axle_count": 2, "axle_load_t": 11.5,
        "ldm_capacity": 7.2, "volume_m3": 45.0, "pallet_places": 18,
        "consumption_empty_l100": 18.0, "consumption_full_l100": 24.0,
        "emission_class": "EURO_VI",
        "compartments_json": '[{"name": "Box body", "ldm": 7.2, "volume_m3": 45, "max_payload_t": 10}]',
    },
]
