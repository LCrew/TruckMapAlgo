"""Valhalla client using `truck` costing.

Valhalla reads OSM restriction tags (maxheight, maxweight, maxaxleload, maxlength,
maxwidth, hgv=no/destination, hazmat) and routes around edges the given truck
profile may not use: low bridges, weight-limited bridges, HGV bans, etc.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import httpx

from ..config import VALHALLA_URL

Coord = tuple[float, float]  # (lat, lon)


class ValhallaError(RuntimeError):
    pass


class NoRouteError(ValhallaError):
    """No legal path exists for the given truck profile."""


@dataclass
class TruckProfile:
    height_m: float
    width_m: float
    length_m: float
    gross_weight_t: float
    axle_load_t: float
    axle_count: int
    hazmat: bool = False

    def costing_options(self) -> dict:
        return {
            "truck": {
                "height": round(self.height_m, 2),
                "width": round(self.width_m, 2),
                "length": round(self.length_m, 2),
                "weight": round(self.gross_weight_t, 2),
                "axle_load": round(self.axle_load_t, 2),
                "axle_count": int(self.axle_count),
                "hazmat": bool(self.hazmat),
            }
        }


@dataclass
class RouteLeg:
    distance_km: float
    duration_h: float
    shape: list[Coord]
    km_by_country: dict[str, float] = field(default_factory=dict)
    has_toll: bool = False
    has_ferry: bool = False


def decode_polyline6(encoded: str) -> list[Coord]:
    coords: list[Coord] = []
    index = lat = lon = 0
    while index < len(encoded):
        for is_lon in (False, True):
            shift = result = 0
            while True:
                b = ord(encoded[index]) - 63
                index += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            delta = ~(result >> 1) if result & 1 else result >> 1
            if is_lon:
                lon += delta
            else:
                lat += delta
        coords.append((lat / 1e6, lon / 1e6))
    return coords


def _loc(c: Coord, kind: str = "break") -> dict:
    return {"lat": c[0], "lon": c[1], "type": kind, "radius": 150}


class ValhallaClient:
    def __init__(self, base_url: str = VALHALLA_URL, timeout: float = 120.0):
        self.base_url = base_url.rstrip("/")
        self.http = httpx.Client(timeout=timeout)

    def _post(self, endpoint: str, payload: dict) -> dict:
        try:
            r = self.http.post(f"{self.base_url}/{endpoint}", json=payload)
        except httpx.HTTPError as e:
            raise ValhallaError(f"Valhalla unreachable at {self.base_url}: {e}") from e
        if r.status_code == 200:
            return r.json()
        try:
            body = r.json()
        except ValueError:
            body = {"error": r.text}
        code = body.get("error_code")
        msg = body.get("error", r.text)
        if code in (171, 442, 443):  # no suitable edges / no path found
            raise NoRouteError(f"No legal truck route: {msg}")
        raise ValhallaError(f"Valhalla {endpoint} failed ({r.status_code}, code {code}): {msg}")

    def status(self) -> dict:
        r = self.http.get(f"{self.base_url}/status", timeout=5)
        r.raise_for_status()
        return r.json()

    def matrix(self, coords: list[Coord], profile: TruckProfile) -> tuple[list[list[float]], list[list[float]]]:
        """Returns (distance_km, duration_h) matrices. Unreachable pairs are None."""
        payload = {
            "sources": [_loc(c) for c in coords],
            "targets": [_loc(c) for c in coords],
            "costing": "truck",
            "costing_options": profile.costing_options(),
            "units": "kilometers",
        }
        data = self._post("sources_to_targets", payload)
        n = len(coords)
        dist = [[None] * n for _ in range(n)]
        dur = [[None] * n for _ in range(n)]
        s2t = data.get("sources_to_targets")
        if isinstance(s2t, dict):  # non-verbose / newer format
            for i in range(n):
                for j in range(n):
                    d, t = s2t["distances"][i][j], s2t["durations"][i][j]
                    dist[i][j] = d
                    dur[i][j] = None if t is None else t / 3600.0
        else:
            for row in s2t:
                for cell in row:
                    i, j = cell["from_index"], cell["to_index"]
                    dist[i][j] = cell.get("distance")
                    t = cell.get("time")
                    dur[i][j] = None if t is None else t / 3600.0
        for i in range(n):
            dist[i][i], dur[i][i] = 0.0, 0.0
        return dist, dur

    def route(self, a: Coord, b: Coord, profile: TruckProfile, with_countries: bool = True) -> RouteLeg:
        payload = {
            "locations": [_loc(a), _loc(b)],
            "costing": "truck",
            "costing_options": profile.costing_options(),
            "units": "kilometers",
            "directions_type": "none",
        }
        data = self._post("route", payload)
        trip = data["trip"]
        shape = []
        for leg in trip["legs"]:
            shape.extend(decode_polyline6(leg["shape"]))
        summary = trip["summary"]
        leg = RouteLeg(
            distance_km=summary["length"],
            duration_h=summary["time"] / 3600.0,
            shape=shape,
            has_toll=bool(summary.get("has_toll")),
            has_ferry=bool(summary.get("has_ferry")),
        )
        if with_countries and leg.distance_km > 0:
            try:
                leg.km_by_country = self.km_by_country(trip["legs"][0]["shape"], profile)
            except ValhallaError:
                leg.km_by_country = {}
        return leg

    def km_by_country(self, encoded_shape: str, profile: TruckProfile) -> dict[str, float]:
        payload = {
            "encoded_polyline": encoded_shape,
            "shape_match": "edge_walk",
            "costing": "truck",
            "costing_options": profile.costing_options(),
            "units": "kilometers",
            "filters": {
                "attributes": ["edge.length", "edge.end_node", "node.admin_index", "admin.country_code"],
                "action": "include",
            },
        }
        data = self._post("trace_attributes", payload)
        admins = data.get("admins", [])
        out: dict[str, float] = {}
        for e in data.get("edges", []):
            idx = (e.get("end_node") or {}).get("admin_index")
            cc = admins[idx]["country_code"] if idx is not None and idx < len(admins) else "??"
            out[cc] = out.get(cc, 0.0) + float(e.get("length", 0.0))
        return {k: round(v, 2) for k, v in out.items()}


_client: ValhallaClient | None = None


def get_client() -> ValhallaClient:
    global _client
    if _client is None:
        _client = ValhallaClient()
    return _client
