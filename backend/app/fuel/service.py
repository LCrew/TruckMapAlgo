"""Latvian fuel prices: scrape, store history, choose the price used for costing."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from ..models import FuelPrice
from .scrapers import ALL_SCRAPERS

log = logging.getLogger(__name__)
STALE_AFTER = timedelta(hours=36)


def refresh(s: Session) -> dict:
    now = datetime.now(timezone.utc)
    ok, errors = [], {}
    for scraper in ALL_SCRAPERS:
        try:
            prices = scraper.fetch()
        except Exception as e:  # network or layout change: keep going with other sources
            log.warning("Fuel scrape failed for %s: %s", scraper.brand, e)
            errors[scraper.brand] = str(e)
            continue
        for p in prices:
            s.add(FuelPrice(brand=p.brand, fuel_type=p.fuel_type, is_diesel=p.is_diesel,
                            price_eur_l=p.price_eur_l, location=p.location, source_url=p.source_url,
                            fetched_at=now))
        ok.append(scraper.brand)
    s.commit()
    return {"fetched_at": now.isoformat(), "sources_ok": ok, "errors": errors}


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def latest(s: Session) -> list[FuelPrice]:
    """Most recent price per (brand, fuel_type)."""
    rows = s.exec(select(FuelPrice).order_by(FuelPrice.fetched_at.desc()).limit(500)).all()
    seen, out = set(), []
    for r in rows:
        key = (r.brand, r.fuel_type)
        if key not in seen:
            seen.add(key)
            out.append(r)
    return sorted(out, key=lambda r: (r.brand, r.fuel_type))


def pricing_diesel_price(s: Session, settings: dict) -> dict:
    """Diesel pump price (EUR/L) used for costing, per the configured mode."""
    mode = settings.get("fuel_price_mode", "min")
    if mode == "manual":
        return {"price": float(settings["fuel_manual_price"]), "mode": "manual", "stale": False, "source": "manual"}
    dd = [r for r in latest(s) if r.fuel_type == "DD"]
    if mode == "brand":
        dd = [r for r in dd if r.brand == settings.get("fuel_brand")] or dd
    if not dd:
        return {"price": float(settings["fuel_manual_price"]), "mode": "manual-fallback", "stale": True,
                "source": "no scraped prices yet; using manual price"}
    prices = [r.price_eur_l for r in dd]
    price = min(prices) if mode in ("min", "brand") else sum(prices) / len(prices)
    newest = max(_aware(r.fetched_at) for r in dd)
    return {
        "price": round(price, 3),
        "mode": mode,
        "stale": datetime.now(timezone.utc) - newest > STALE_AFTER,
        "fetched_at": newest.isoformat(),
        "source": ", ".join(sorted({r.brand for r in dd})),
    }


def history(s: Session, days: int = 90) -> list[dict]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = s.exec(select(FuelPrice).where(FuelPrice.fetched_at >= since, FuelPrice.is_diesel == True)  # noqa: E712
                  .order_by(FuelPrice.fetched_at)).all()
    return [{"brand": r.brand, "fuel_type": r.fuel_type, "price": r.price_eur_l,
             "fetched_at": _aware(r.fetched_at).isoformat()} for r in rows]
