from fastapi import APIRouter, Depends
from sqlmodel import Session

from ..db import get_session, load_settings
from ..fuel import service

router = APIRouter(prefix="/fuel")


@router.get("/latest")
def latest(s: Session = Depends(get_session)):
    return [r.model_dump() for r in service.latest(s)]


@router.get("/pricing")
def pricing(s: Session = Depends(get_session)):
    return service.pricing_diesel_price(s, load_settings(s))


@router.post("/refresh")
def refresh(s: Session = Depends(get_session)):
    result = service.refresh(s)
    result["pricing"] = service.pricing_diesel_price(s, load_settings(s))
    return result


@router.get("/history")
def history(days: int = 90, s: Session = Depends(get_session)):
    return service.history(s, days)
