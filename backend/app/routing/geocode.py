"""Nominatim geocoding limited to the Baltic states, cached in SQLite.

Respects the Nominatim usage policy: one request per second, identifying User-Agent.
"""
import threading
import time

import httpx
from sqlmodel import Session

from ..config import HTTP_USER_AGENT, NOMINATIM_URL
from ..models import GeocodeCache

_lock = threading.Lock()
_last_call = 0.0


def _throttle():
    global _last_call
    with _lock:
        wait = 1.05 - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()


def search(q: str, limit: int = 5) -> list[dict]:
    _throttle()
    r = httpx.get(
        f"{NOMINATIM_URL}/search",
        params={"q": q, "format": "jsonv2", "countrycodes": "lv,lt,ee", "limit": limit, "addressdetails": 1},
        headers={"User-Agent": HTTP_USER_AGENT, "Accept-Language": "lv,en"},
        timeout=15,
    )
    r.raise_for_status()
    return [
        {
            "lat": float(x["lat"]),
            "lon": float(x["lon"]),
            "display_name": x["display_name"],
            "country_code": (x.get("address") or {}).get("country_code", "").upper(),
        }
        for x in r.json()
    ]


def reverse(lat: float, lon: float) -> dict:
    _throttle()
    r = httpx.get(
        f"{NOMINATIM_URL}/reverse",
        params={"lat": lat, "lon": lon, "format": "jsonv2", "addressdetails": 1},
        headers={"User-Agent": HTTP_USER_AGENT, "Accept-Language": "lv,en"},
        timeout=15,
    )
    r.raise_for_status()
    x = r.json()
    return {
        "lat": lat,
        "lon": lon,
        "display_name": x.get("display_name", f"{lat:.5f}, {lon:.5f}"),
        "country_code": (x.get("address") or {}).get("country_code", "").upper(),
    }


def geocode(s: Session, address: str) -> dict | None:
    key = address.strip().lower()
    if not key:
        return None
    cached = s.get(GeocodeCache, key)
    if cached:
        return cached.model_dump()
    results = search(address, limit=1)
    if not results:
        return None
    hit = results[0]
    s.add(GeocodeCache(query=key, **hit))
    s.commit()
    return hit
