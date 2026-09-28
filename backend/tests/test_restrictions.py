import json

import httpx
import pytest
from sqlmodel import Session, SQLModel, create_engine

from app import restrictions as R
from app.models import OverpassTile  # noqa: F401  (register table)


def _write(path, feats):
    path.write_text("\n".join(json.dumps(f) for f in feats), encoding="utf-8")


def feat(geom, **tags):
    return {"type": "Feature", "geometry": geom, "properties": tags}


@pytest.fixture
def index(tmp_path):
    p = tmp_path / "r.geojsonseq"
    _write(p, [
        feat({"type": "LineString", "coordinates": [[24.09, 56.94], [24.10, 56.95], [24.11, 56.96]]},
             highway="secondary", name="Kuģu iela", maxheight="3.2"),
        feat({"type": "LineString", "coordinates": [[24.01, 56.93], [24.02, 56.94]]}, maxweight="30"),
        feat({"type": "Point", "coordinates": [24.105, 56.951]}, highway="traffic_signals"),  # untagged way node
        feat({"type": "LineString", "coordinates": [[24.10, 56.95], [24.11, 56.95]]}, hgv="no"),
        feat({"type": "Point", "coordinates": [26.72, 58.38]}, maxheight="default"),  # non-numeric: ignored
    ])
    return R.LocalIndex(p)


def test_local_index_filters_by_bbox_and_truck(index):
    hits = index.query(56.90, 24.00, 57.00, 24.20)
    assert len(hits) == 3  # way node and the Tartu 'default' are not restrictions
    tall_heavy = [x for x in (h.for_truck(4.0, 40, None, None, None) for h in hits) if x]
    assert {x["name"] for x in tall_heavy if x["blocks"]} == {"Kuģu iela", ""}
    low_light = [x for x in (h.for_truck(3.0, 20, None, None, None) for h in hits) if x]
    assert [x["restrictions"] for x in low_light] == [["no HGV"]]  # height and weight OK for this truck


def test_local_index_reloads_when_file_changes(index, tmp_path):
    assert len(index.query(56.9, 24.0, 57.0, 24.2)) == 3
    import os
    import time
    _write(index.path, [feat({"type": "Point", "coordinates": [24.05, 56.95]}, maxheight="2.5")])
    os.utime(index.path, (time.time() + 5, time.time() + 5))
    assert len(index.query(56.9, 24.0, 57.0, 24.2)) == 1


class FakeResp:
    def __init__(self, status, elements=(), headers=None):
        self.status_code, self._elements, self.headers = status, list(elements), headers or {}

    def json(self):
        return {"elements": self._elements}

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError("err", request=httpx.Request("POST", "x"), response=None)


@pytest.fixture
def session():
    eng = create_engine("sqlite://")
    SQLModel.metadata.create_all(eng)
    with Session(eng) as s:
        yield s


def test_overpass_tiles_are_cached_between_pans(session, monkeypatch):
    calls = []
    el = {"type": "way", "center": {"lat": 56.95, "lon": 24.10}, "tags": {"maxheight": "3.2"}}

    def fake_post(*a, **k):
        calls.append(k["data"]["data"])
        return FakeResp(200, [el])

    monkeypatch.setattr(R.httpx, "post", fake_post)
    cache = R.OverpassCache()
    items, partial = cache.query(session, 56.90, 24.00, 56.99, 24.20)
    assert len(items) == 1 and not partial and len(calls) == 1
    # slightly different view inside the same tile: served from SQLite, no new call
    items, _ = cache.query(session, 56.91, 24.02, 56.98, 24.18)
    assert len(items) == 1 and len(calls) == 1


def test_overpass_rate_limit_backs_off(session, monkeypatch):
    calls = []

    def fake_post(*a, **k):
        calls.append(1)
        return FakeResp(429, headers={"Retry-After": "120"})

    monkeypatch.setattr(R.httpx, "post", fake_post)
    cache = R.OverpassCache()
    items, partial = cache.query(session, 56.90, 24.00, 56.99, 24.20)
    assert items == [] and partial and len(calls) == 1
    cache.query(session, 56.90, 24.00, 56.99, 24.20)
    assert len(calls) == 1  # still backing off: no hammering
