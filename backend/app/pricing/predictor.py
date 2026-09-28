"""Market price prediction.

Until enough invoiced prices exist, the prediction is the cost-plus price. Once there are
MIN_TRAINING_SAMPLES rows in `PriceSample`, gradient-boosting models learn the
real price (median plus a 10–90 % band) from order features and history.
"""
from __future__ import annotations

import logging
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import cross_val_score
from sqlmodel import Session, select

from ..config import DATA_DIR, MIN_TRAINING_SAMPLES
from ..models import PriceSample

log = logging.getLogger(__name__)
MODEL_PATH = DATA_DIR / "price_model.joblib"
FEATURES = [
    "km_on_board", "eff_ldm", "weight_kg", "share", "dest_lat", "dest_lon",
    "is_lv", "is_lt", "is_ee", "fuel_price", "month", "weekday", "co_loaded",
    "standalone_cost", "cost_price",
]

_model_cache: dict | None = None


def _frame(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    date = pd.to_datetime(df["date"], utc=True)
    df["month"] = date.dt.month
    df["weekday"] = date.dt.weekday
    cc = df["dest_country"].fillna("LV").str.upper()
    df["is_lv"], df["is_lt"], df["is_ee"] = (cc == "LV") * 1, (cc == "LT") * 1, (cc == "EE") * 1
    df["dest_lat"] = df["dest_lat"].fillna(56.95)
    df["dest_lon"] = df["dest_lon"].fillna(24.1)
    return df[FEATURES].astype(float)


def train(s: Session) -> dict:
    global _model_cache
    samples = s.exec(select(PriceSample)).all()
    n = len(samples)
    if n < MIN_TRAINING_SAMPLES:
        return {"trained": False, "samples": n, "required": MIN_TRAINING_SAMPLES}
    rows = [x.model_dump() for x in samples]
    X = _frame(rows)
    y = np.array([r["actual_price"] for r in rows], dtype=float)
    common = dict(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=42)
    median = GradientBoostingRegressor(loss="absolute_error", **common).fit(X, y)
    lo = GradientBoostingRegressor(loss="quantile", alpha=0.1, **common).fit(X, y)
    hi = GradientBoostingRegressor(loss="quantile", alpha=0.9, **common).fit(X, y)
    folds = min(5, n // 6)
    mae = None
    if folds >= 2:
        scores = cross_val_score(GradientBoostingRegressor(loss="absolute_error", **common), X, y,
                                 cv=folds, scoring="neg_mean_absolute_error")
        mae = float(-scores.mean())
    bundle = {"median": median, "lo": lo, "hi": hi, "samples": n, "cv_mae": mae,
              "trained_at": datetime.utcnow().isoformat()}
    joblib.dump(bundle, MODEL_PATH)
    _model_cache = bundle
    return {"trained": True, "samples": n, "cv_mae": mae}


def _load() -> dict | None:
    global _model_cache
    if _model_cache is None and MODEL_PATH.exists():
        try:
            _model_cache = joblib.load(MODEL_PATH)
        except Exception as e:  # corrupt/incompatible model file
            log.warning("Could not load price model: %s", e)
    return _model_cache


def status() -> dict:
    m = _load()
    if not m:
        return {"trained": False}
    return {"trained": True, "samples": m["samples"], "cv_mae": m["cv_mae"], "trained_at": m["trained_at"]}


def predict(features: dict) -> dict:
    """features: same keys as PriceSample (without actual_price)."""
    cost_price = features["cost_price"]
    m = _load()
    if not m:
        return {"price": round(cost_price, 2), "low": None, "high": None, "method": "cost-plus"}
    X = _frame([features])
    p = float(m["median"].predict(X)[0])
    lo, hi = float(m["lo"].predict(X)[0]), float(m["hi"].predict(X)[0])
    return {"price": round(p, 2), "low": round(min(lo, p), 2), "high": round(max(hi, p), 2),
            "method": f"ml ({m['samples']} samples)"}
