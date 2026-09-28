import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, UploadFile
from sqlmodel import Session, func, select

from ..config import MIN_TRAINING_SAMPLES
from ..db import get_session
from ..i18n import AppError
from ..models import PriceSample
from ..pricing import predictor

router = APIRouter(prefix="/predictor")

CSV_COLUMNS = ["date", "km_on_board", "eff_ldm", "weight_kg", "share", "dest_lat", "dest_lon", "dest_country",
               "fuel_price", "co_loaded", "standalone_cost", "cost_price", "actual_price"]


@router.get("/status")
def status(s: Session = Depends(get_session)):
    n = s.exec(select(func.count()).select_from(PriceSample)).one()
    return {**predictor.status(), "samples_available": n, "required": MIN_TRAINING_SAMPLES,
            "csv_columns": CSV_COLUMNS}


@router.post("/train")
def train(s: Session = Depends(get_session)):
    return predictor.train(s)


@router.post("/import")
async def import_history(file: UploadFile, s: Session = Depends(get_session)):
    """Historical priced orders. Required: date, km_on_board, eff_ldm, fuel_price, actual_price."""
    text = (await file.read()).decode("utf-8-sig")
    n = 0
    try:
        for row in csv.DictReader(io.StringIO(text)):
            f = lambda k, d=0.0: float(row[k]) if row.get(k) not in (None, "") else d  # noqa: E731
            actual = f("actual_price")
            s.add(PriceSample(
                date=datetime.fromisoformat(row["date"]), km_on_board=f("km_on_board"), eff_ldm=f("eff_ldm"),
                weight_kg=f("weight_kg"), share=f("share", 1.0),
                dest_lat=f("dest_lat", None), dest_lon=f("dest_lon", None),
                dest_country=(row.get("dest_country") or "LV").upper(), fuel_price=f("fuel_price"),
                co_loaded=int(f("co_loaded", 1)), standalone_cost=f("standalone_cost"),
                cost_price=f("cost_price", actual), actual_price=actual,
            ))
            n += 1
    except (KeyError, ValueError) as e:
        raise AppError("bad_history_csv", 422, row=n + 2, detail=str(e))
    s.commit()
    return {"imported": n}
