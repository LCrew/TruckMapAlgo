"""Settings, trucks, orders, geocoding."""
import csv
import io
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile
from sqlmodel import Session, SQLModel, select

from ..db import get_session, load_settings, save_settings
from ..i18n import AppError
from ..fleet import normalize_truck
from ..models import Order, OrderBase, Truck
from ..planner import record_actual_price
from ..routing import geocode

router = APIRouter()


# ---------- settings
@router.get("/settings")
def get_settings(s: Session = Depends(get_session)):
    return load_settings(s)


@router.put("/settings")
def put_settings(values: dict, s: Session = Depends(get_session)):
    return save_settings(s, values)


# ---------- trucks
@router.get("/trucks", response_model=list[Truck])
def list_trucks(s: Session = Depends(get_session)):
    return s.exec(select(Truck)).all()


@router.post("/trucks", response_model=Truck)
def create_truck(t: Truck, s: Session = Depends(get_session)):
    t.id = None
    normalize_truck(t)
    s.add(t)
    s.commit()
    s.refresh(t)
    return t


@router.put("/trucks/{truck_id}", response_model=Truck)
def update_truck(truck_id: int, data: dict, s: Session = Depends(get_session)):
    t = s.get(Truck, truck_id)
    if not t:
        raise AppError("truck_not_found", 404, id=truck_id)
    for k, v in data.items():
        if k != "id" and hasattr(t, k):
            setattr(t, k, v)
    normalize_truck(t)
    s.add(t)
    s.commit()
    s.refresh(t)
    return t


@router.delete("/trucks/{truck_id}")
def delete_truck(truck_id: int, s: Session = Depends(get_session)):
    t = s.get(Truck, truck_id)
    if t:
        s.delete(t)
        s.commit()
    return {"ok": True}


FLEET_CSV_HELP = (
    "name,plate,trailer_plate,height_m,width_m,length_m,empty_weight_t,max_payload_t,axle_count,axle_load_t,"
    "consumption_empty_l100,consumption_full_l100,emission_class,"
    "tent1_name,tent1_ldm,tent1_m3,tent1_payload_t,tent2_name,tent2_ldm,tent2_m3,tent2_payload_t"
)


@router.post("/trucks/import")
async def import_trucks(file: UploadFile, s: Session = Depends(get_session)):
    """Fleet CSV, one row per unit. tent2_* columns empty for single-trailer units. Rows with an
    existing plate update that unit."""
    import json as _json

    text = (await file.read()).decode("utf-8-sig")
    created = updated = 0
    num_fields = ["height_m", "width_m", "length_m", "empty_weight_t", "max_payload_t", "axle_load_t",
                  "consumption_empty_l100", "consumption_full_l100"]
    try:
        for n, row in enumerate(csv.DictReader(io.StringIO(text)), start=2):
            comps = []
            for i in (1, 2, 3):
                if row.get(f"tent{i}_ldm") or row.get(f"tent{i}_m3"):
                    comps.append({"name": row.get(f"tent{i}_name") or f"Tent {i}",
                                  "ldm": float(row.get(f"tent{i}_ldm") or 0),
                                  "volume_m3": float(row.get(f"tent{i}_m3") or 0),
                                  "max_payload_t": float(row.get(f"tent{i}_payload_t") or 0)})
            if not comps:
                raise ValueError(f"row {n}: at least tent1_ldm or tent1_m3 is required")
            values = {k: float(row[k]) for k in num_fields if row.get(k)}
            if row.get("axle_count"):
                values["axle_count"] = int(float(row["axle_count"]))
            for k in ("name", "plate", "trailer_plate", "emission_class"):
                if row.get(k):
                    values[k] = row[k].strip()
            values["compartments_json"] = _json.dumps(comps, ensure_ascii=False)
            existing = s.exec(select(Truck).where(Truck.plate == values.get("plate"))).first() \
                if values.get("plate") else None
            t = existing or Truck(name=values.get("name") or values.get("plate") or "Truck")
            for k, v in values.items():
                setattr(t, k, v)
            normalize_truck(t)
            s.add(t)
            updated += bool(existing)
            created += not existing
    except (ValueError, KeyError) as e:
        raise AppError("bad_fleet_csv", 422, detail=str(e), columns=FLEET_CSV_HELP)
    s.commit()
    return {"created": created, "updated": updated}


# ---------- orders
class OrderIn(OrderBase):
    pass


class ActualPrice(SQLModel):
    actual_price: Optional[float]


@router.get("/orders", response_model=list[Order])
def list_orders(status: Optional[str] = None, s: Session = Depends(get_session)):
    q = select(Order).order_by(Order.id.desc())
    if status:
        q = q.where(Order.status == status)
    return s.exec(q).all()


@router.post("/orders", response_model=Order)
def create_order(data: OrderIn, s: Session = Depends(get_session)):
    o = Order(**data.model_dump())
    s.add(o)
    s.commit()
    s.refresh(o)
    return o


@router.put("/orders/{order_id}", response_model=Order)
def update_order(order_id: int, data: dict, s: Session = Depends(get_session)):
    o = s.get(Order, order_id)
    if not o:
        raise AppError("order_not_found", 404)
    # changing an address invalidates cached coordinates unless new ones are sent
    if "delivery_address" in data and data["delivery_address"] != o.delivery_address and "delivery_lat" not in data:
        o.delivery_lat = o.delivery_lon = None
    if "pickup_address" in data and data["pickup_address"] != o.pickup_address and "pickup_lat" not in data:
        o.pickup_lat = o.pickup_lon = None
    for k, v in data.items():
        if k in OrderBase.model_fields or k == "status":
            setattr(o, k, v)
    s.add(o)
    s.commit()
    s.refresh(o)
    return o


@router.put("/orders/{order_id}/actual-price", response_model=Order)
def set_actual_price(order_id: int, body: ActualPrice, s: Session = Depends(get_session)):
    o = s.get(Order, order_id)
    if not o:
        raise AppError("order_not_found", 404)
    record_actual_price(s, o, body.actual_price)
    s.refresh(o)
    return o


@router.delete("/orders/{order_id}")
def delete_order(order_id: int, s: Session = Depends(get_session)):
    o = s.get(Order, order_id)
    if o:
        s.delete(o)
        s.commit()
    return {"ok": True}


@router.post("/orders/import")
async def import_orders(file: UploadFile, s: Session = Depends(get_session)):
    """CSV columns: reference,customer,pickup_address,delivery_address,ldm,volume_m3,weight_kg,pallets,hazmat"""
    text = (await file.read()).decode("utf-8-sig")
    n = 0
    for row in csv.DictReader(io.StringIO(text)):
        s.add(Order(
            reference=row.get("reference", ""), customer=row.get("customer", ""),
            pickup_address=row.get("pickup_address") or None, delivery_address=row["delivery_address"],
            ldm=float(row.get("ldm") or 0), volume_m3=float(row.get("volume_m3") or 0),
            weight_kg=float(row.get("weight_kg") or 0), pallets=int(float(row.get("pallets") or 0)),
            hazmat=str(row.get("hazmat", "")).strip().lower() in ("1", "true", "yes", "y", "jā"),
        ))
        n += 1
    s.commit()
    return {"imported": n}


# ---------- geocoding
@router.get("/geocode/search")
def geocode_search(q: str):
    try:
        return geocode.search(q)
    except Exception as e:
        raise AppError("geocoder_error", 502, detail=str(e))


@router.get("/geocode/reverse")
def geocode_reverse(lat: float, lon: float):
    try:
        return geocode.reverse(lat, lon)
    except Exception as e:
        raise AppError("geocoder_error", 502, detail=str(e))
