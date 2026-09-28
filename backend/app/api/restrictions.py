"""Truck restrictions overlay for the visible map area (see app/restrictions.py for sources and caching)."""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlmodel import Session

from .. import restrictions as svc
from ..db import get_session

router = APIRouter()


@router.get("/restrictions")
def restrictions(south: float, west: float, north: float, east: float, height: float = 4.0, weight: float = 40.0,
                 axle_load: Optional[float] = None, length: Optional[float] = None, width: Optional[float] = None,
                 s: Session = Depends(get_session)):
    return svc.find(s, south, west, north, east, height, weight, axle_load, length, width)


@router.get("/restrictions/status")
def status():
    idx = svc.local_index
    if idx.available():
        idx._ensure_loaded()
    return {"local_index": idx.available(), "path": str(idx.path), "count": idx.count}
