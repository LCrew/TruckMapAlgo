from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Setting(SQLModel, table=True):
    key: str = Field(primary_key=True)
    value: str


class Truck(SQLModel, table=True):
    """A fleet unit: fixed combination of a truck and its tent compartment(s).

    Semi-trailer units have one compartment; truck + drawbar trailer units ([truck]-[tent]-[tent])
    have two: the truck's own tent body and the trailer tent. Unit-level ldm_capacity and
    volume_m3 are kept equal to the sum of the compartments; max_payload_t is the legal
    payload of the whole combination (GVW minus empty weight).
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    plate: str = ""
    trailer_plate: str = ""
    active: bool = True  # available for planning and auto-pick
    # JSON list of {"name", "ldm", "volume_m3", "max_payload_t"}
    compartments_json: str = "[]"
    height_m: float = 4.0
    width_m: float = 2.55
    length_m: float = 16.5
    empty_weight_t: float = 14.5
    max_payload_t: float = 24.0
    axle_count: int = 5
    axle_load_t: float = 10.0
    ldm_capacity: float = 13.6
    volume_m3: float = 90.0
    pallet_places: int = 33
    consumption_empty_l100: float = 23.0
    consumption_full_l100: float = 33.0
    emission_class: str = "EURO_VI"
    # Optional per-truck cost overrides (None = use global settings)
    wear_eur_per_km: Optional[float] = None
    fixed_eur_per_day: Optional[float] = None
    driver_hourly_rate: Optional[float] = None


class OrderBase(SQLModel):
    reference: str = ""
    customer: str = ""
    # Pickup: when address/coords are empty the order is loaded at the depot.
    pickup_address: Optional[str] = None
    pickup_lat: Optional[float] = None
    pickup_lon: Optional[float] = None
    delivery_address: str = ""
    delivery_lat: Optional[float] = None
    delivery_lon: Optional[float] = None
    ldm: float = 0.0
    volume_m3: float = 0.0
    weight_kg: float = 0.0
    pallets: int = 0
    hazmat: bool = False
    notes: str = ""


class Order(OrderBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    status: str = "open"  # open | planned | delivered
    created_at: datetime = Field(default_factory=utcnow)
    run_id: Optional[int] = Field(default=None, foreign_key="run.id")
    # Filled in when a run is saved
    share: Optional[float] = None
    allocated_cost: Optional[float] = None
    standalone_cost: Optional[float] = None
    predicted_price: Optional[float] = None
    km_on_board: Optional[float] = None
    # Filled in by the user after invoicing: feeds the price predictor
    actual_price: Optional[float] = None


class Run(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=utcnow)
    truck_id: int = Field(foreign_key="truck.id")
    name: str = ""
    total_km: float = 0.0
    total_cost: float = 0.0
    fuel_price: float = 0.0
    result_json: str = "{}"


class FuelPrice(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    brand: str
    fuel_type: str  # e.g. "DD", "DD premium", "95", "98", "LPG"
    is_diesel: bool = False
    price_eur_l: float
    location: str = ""
    source_url: str = ""
    fetched_at: datetime = Field(default_factory=utcnow, index=True)


class PriceSample(SQLModel, table=True):
    """One historical order with its real invoiced price: the ML training row."""

    id: Optional[int] = Field(default=None, primary_key=True)
    order_id: Optional[int] = Field(default=None, index=True)
    date: datetime = Field(default_factory=utcnow)
    km_on_board: float
    eff_ldm: float
    weight_kg: float = 0.0
    share: float = 1.0
    dest_lat: Optional[float] = None
    dest_lon: Optional[float] = None
    dest_country: str = "LV"
    fuel_price: float
    co_loaded: int = 1
    standalone_cost: float = 0.0
    cost_price: float = 0.0
    actual_price: float


class GeocodeCache(SQLModel, table=True):
    query: str = Field(primary_key=True)
    lat: float
    lon: float
    display_name: str
    country_code: str = ""


class OverpassTile(SQLModel, table=True):
    """Cached Overpass restriction elements for one fixed map tile (fallback source only)."""

    key: str = Field(primary_key=True)  # "lat_index:lon_index" of a 0.25° tile
    data: str = "[]"
    fetched_at: datetime = Field(default_factory=utcnow)
