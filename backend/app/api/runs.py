import json

from fastapi import APIRouter, Depends, Request
from sqlmodel import Session, SQLModel, select

from ..db import get_session
from ..i18n import AppError, localize_plan, request_lang
from ..models import Run
from ..planner import compare_fleet, plan_run
from ..routing.valhalla import ValhallaError

router = APIRouter()


class PlanRequest(SQLModel):
    order_ids: list[int]
    truck_id: int
    save: bool = False
    name: str = ""


@router.post("/runs/plan")
def plan(req: PlanRequest, request: Request, s: Session = Depends(get_session)):
    try:
        result = plan_run(s, req.order_ids, req.truck_id, save=req.save, name=req.name)
    except ValhallaError as e:
        raise AppError("routing_engine_error", 503, detail=str(e))
    return localize_plan(result, request_lang(request))


class CompareRequest(SQLModel):
    order_ids: list[int]
    truck_ids: list[int] | None = None  # default: every available unit


@router.post("/runs/compare")
def compare(req: CompareRequest, request: Request, s: Session = Depends(get_session)):
    """Rank fleet units for the selected orders by total run cost."""
    try:
        return compare_fleet(s, req.order_ids, req.truck_ids, lang=request_lang(request))
    except ValhallaError as e:
        raise AppError("routing_engine_error", 503, detail=str(e))


@router.get("/runs")
def list_runs(s: Session = Depends(get_session)):
    runs = s.exec(select(Run).order_by(Run.id.desc())).all()
    return [{"id": r.id, "name": r.name, "created_at": r.created_at, "truck_id": r.truck_id,
             "total_km": r.total_km, "total_cost": r.total_cost, "fuel_price": r.fuel_price} for r in runs]


@router.get("/runs/{run_id}")
def get_run(run_id: int, request: Request, s: Session = Depends(get_session)):
    r = s.get(Run, run_id)
    if not r:
        raise AppError("run_not_found", 404)
    return localize_plan({"id": r.id, "name": r.name, **json.loads(r.result_json)}, request_lang(request))


@router.delete("/runs/{run_id}")
def delete_run(run_id: int, s: Session = Depends(get_session)):
    from ..models import Order

    r = s.get(Run, run_id)
    if r:
        for o in s.exec(select(Order).where(Order.run_id == run_id)).all():
            o.run_id, o.status = None, "open"
            s.add(o)
        s.delete(r)
        s.commit()
    return {"ok": True}
