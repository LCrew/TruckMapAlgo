"""Truck restrictions (low clearances, weight/axle/size limits, HGV bans) for the map overlay.

Primary source: a local index built from the same OSM extract the router uses
(valhalla/restrictions/restrictions.geojsonseq, produced by fetch_osm.sh). It is loaded
into an in-memory grid once and reloaded automatically when the file changes: no
network calls, no rate limits, and always consistent with the routing data.

Fallback (index file missing): Overpass, cached in SQLite per fixed 0.25° tile for
OVERPASS_TTL. Map pans reuse tiles instead of sending a new bbox query each time,
429/504 responses back off and serve stale tiles, and at most OVERPASS_MAX_FETCH new
tiles are fetched per request.
"""
from __future__ import annotations

import json
import logging
import math
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from sqlmodel import Session

from .config import HTTP_USER_AGENT, OVERPASS_URL, RESTRICTIONS_FILE
from .i18n import AppError
from .models import OverpassTile

log = logging.getLogger(__name__)

GRID = 0.05  # degrees per in-memory grid cell
TILE = 0.25  # degrees per Overpass cache tile
OVERPASS_TTL = timedelta(days=7)
OVERPASS_MAX_FETCH = 4
MAX_RESULTS = 3000


def _num(v: str | None) -> float | None:
    if not v:
        return None
    m = re.search(r"\d+(?:[.,]\d+)?", v)
    return float(m.group(0).replace(",", ".")) if m else None


@dataclass(slots=True)
class Restriction:
    lat: float
    lon: float
    name: str
    maxheight: float | None
    maxweight: float | None
    maxaxleload: float | None
    maxlength: float | None
    maxwidth: float | None
    hgv_no: bool
    raw: dict

    @classmethod
    def from_tags(cls, lat: float, lon: float, tags: dict) -> Restriction | None:
        r = cls(
            lat=lat, lon=lon, name=tags.get("name") or tags.get("ref") or "",
            maxheight=_num(tags.get("maxheight")), maxweight=_num(tags.get("maxweight")),
            maxaxleload=_num(tags.get("maxaxleload")), maxlength=_num(tags.get("maxlength")),
            maxwidth=_num(tags.get("maxwidth")), hgv_no=tags.get("hgv") == "no",
            raw={k: tags[k] for k in ("maxheight", "maxweight", "maxaxleload", "maxlength", "maxwidth") if k in tags},
        )
        if r.hgv_no or any(v is not None for v in (r.maxheight, r.maxweight, r.maxaxleload, r.maxlength, r.maxwidth)):
            return r
        return None

    def for_truck(self, height: float, weight: float, axle_load: float | None,
                  length: float | None, width: float | None) -> dict | None:
        kinds, blocks = [], False
        checks = [
            (self.maxheight, height, "max height", "maxheight", "m"),
            (self.maxweight, weight, "max weight", "maxweight", "t"),
            (self.maxaxleload, axle_load, "max axle load", "maxaxleload", "t"),
            (self.maxlength, length, "max length", "maxlength", "m"),
            (self.maxwidth, width, "max width", "maxwidth", "m"),
        ]
        for limit, value, label, key, unit in checks:
            if limit is None:
                continue
            if value is None or limit < value:
                kinds.append(f"{label} {self.raw[key]} {unit}".replace(f"{unit} {unit}", unit))
                blocks = blocks or (value is not None and limit < value)
        if self.hgv_no:
            kinds.append("no HGV")
            blocks = True
        if not kinds:
            return None
        return {"lat": self.lat, "lon": self.lon, "name": self.name, "restrictions": kinds, "blocks": blocks}


def _representative_point(geom: dict) -> tuple[float, float] | None:
    t, c = geom.get("type"), geom.get("coordinates")
    if not c:
        return None
    if t == "Point":
        return c[1], c[0]
    if t == "LineString":
        p = c[len(c) // 2]
        return p[1], p[0]
    if t in ("MultiLineString", "Polygon"):
        ring = c[0]
        p = ring[len(ring) // 2]
        return p[1], p[0]
    if t == "MultiPolygon":
        ring = c[0][0]
        p = ring[len(ring) // 2]
        return p[1], p[0]
    return None


class LocalIndex:
    """Restrictions from the local OSM extract, bucketed on a lat/lon grid."""

    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._mtime: float | None = None
        self._grid: dict[tuple[int, int], list[Restriction]] = {}
        self.count = 0

    def available(self) -> bool:
        return self.path.exists()

    def _ensure_loaded(self) -> None:
        mtime = self.path.stat().st_mtime
        if mtime == self._mtime:
            return
        with self._lock:
            if mtime == self._mtime:
                return
            grid: dict[tuple[int, int], list[Restriction]] = {}
            n = 0
            with self.path.open(encoding="utf-8") as f:
                for line in f:
                    line = line.strip().lstrip("\x1e")
                    if not line:
                        continue
                    feat = json.loads(line)
                    pt = _representative_point(feat.get("geometry") or {})
                    if not pt:
                        continue
                    r = Restriction.from_tags(pt[0], pt[1], feat.get("properties") or {})
                    if r:
                        grid.setdefault((math.floor(r.lat / GRID), math.floor(r.lon / GRID)), []).append(r)
                        n += 1
            self._grid, self.count, self._mtime = grid, n, mtime
            log.info("Loaded %d truck restrictions from %s", n, self.path)

    def query(self, south: float, west: float, north: float, east: float) -> list[Restriction]:
        self._ensure_loaded()
        out = []
        for i in range(math.floor(south / GRID), math.floor(north / GRID) + 1):
            for j in range(math.floor(west / GRID), math.floor(east / GRID) + 1):
                for r in self._grid.get((i, j), ()):
                    if south <= r.lat <= north and west <= r.lon <= east:
                        out.append(r)
        return out


class OverpassCache:
    """Fallback: Overpass results cached per fixed tile in SQLite."""

    def __init__(self):
        self._backoff_until = 0.0

    @staticmethod
    def _tiles(south: float, west: float, north: float, east: float) -> list[tuple[int, int]]:
        return [(i, j)
                for i in range(math.floor(south / TILE), math.floor(north / TILE) + 1)
                for j in range(math.floor(west / TILE), math.floor(east / TILE) + 1)]

    def _fetch_tile(self, i: int, j: int) -> list[dict]:
        s, w = i * TILE, j * TILE
        bbox = f"{s},{w},{s + TILE},{w + TILE}"
        q = f"""[out:json][timeout:60];
(way["maxheight"]({bbox}); node["maxheight"]({bbox}); way["maxweight"]({bbox});
 way["maxaxleload"]({bbox}); way["maxlength"]({bbox}); way["maxwidth"]({bbox}); way["hgv"="no"]({bbox}););
out tags center;"""
        r = httpx.post(OVERPASS_URL, data={"data": q}, headers={"User-Agent": HTTP_USER_AGENT}, timeout=90)
        if r.status_code in (429, 504):
            retry = r.headers.get("Retry-After")
            self._backoff_until = time.monotonic() + (float(retry) if retry and retry.isdigit() else 60)
        r.raise_for_status()
        out = []
        for el in r.json().get("elements", []):
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat is not None:
                out.append({"lat": lat, "lon": lon, "tags": el.get("tags", {})})
        return out

    def query(self, s: Session, south: float, west: float, north: float, east: float) -> tuple[list[Restriction], bool]:
        now = datetime.now(timezone.utc)
        results: list[Restriction] = []
        fetched, partial = 0, False
        for i, j in self._tiles(south, west, north, east):
            key = f"{i}:{j}"
            row = s.get(OverpassTile, key)
            fetched_at = row.fetched_at.replace(tzinfo=timezone.utc) if row and row.fetched_at.tzinfo is None \
                else (row.fetched_at if row else None)
            fresh = row is not None and now - fetched_at < OVERPASS_TTL
            if not fresh and fetched < OVERPASS_MAX_FETCH and time.monotonic() >= self._backoff_until:
                try:
                    elements = self._fetch_tile(i, j)
                    row = row or OverpassTile(key=key, data="[]")
                    row.data, row.fetched_at = json.dumps(elements), now
                    s.add(row)
                    s.commit()
                    fetched += 1
                except httpx.HTTPError as e:
                    log.warning("Overpass tile %s failed: %s", key, e)
                    partial = partial or row is None
            elif not fresh:
                partial = partial or row is None
            if row is None:
                continue
            for el in json.loads(row.data):
                if south <= el["lat"] <= north and west <= el["lon"] <= east:
                    r = Restriction.from_tags(el["lat"], el["lon"], el["tags"])
                    if r:
                        results.append(r)
        return results, partial


local_index = LocalIndex(RESTRICTIONS_FILE)
overpass_cache = OverpassCache()


def find(s: Session, south: float, west: float, north: float, east: float, height: float, weight: float,
         axle_load: float | None = None, length: float | None = None, width: float | None = None) -> dict:
    if local_index.available():
        items, source, partial = local_index.query(south, west, north, east), "local", False
    else:
        if (north - south) * (east - west) > 1.0:
            raise AppError("restrictions_zoom_in", 400)
        items, partial = overpass_cache.query(s, south, west, north, east)
        source = "overpass-cache"
    out = [x for x in (r.for_truck(height, weight, axle_load, length, width) for r in items) if x]
    out.sort(key=lambda x: not x["blocks"])  # blocking ones first when truncated
    return {"items": out[:MAX_RESULTS], "total": len(out), "truncated": len(out) > MAX_RESULTS,
            "source": source, "partial": partial}
