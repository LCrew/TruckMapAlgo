import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from .api import core, fuel, issues, prediction, restrictions, runs
from .config import FUEL_REFRESH_HOURS
from .db import engine, init_db
from .i18n import AppError, app_error_handler
from .fuel import service as fuel_service
from .routing.valhalla import get_client

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("truckmap")
scheduler = BackgroundScheduler()


def scheduled_fuel_refresh():
    with Session(engine) as s:
        log.info("Fuel refresh: %s", fuel_service.refresh(s))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.add_job(scheduled_fuel_refresh, "interval", hours=FUEL_REFRESH_HOURS,
                      id="fuel", replace_existing=True)
    scheduler.add_job(scheduled_fuel_refresh, id="fuel-initial")  # once at startup
    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Baltic Truck Route Optimizer", lifespan=lifespan)
app.add_exception_handler(AppError, app_error_handler)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
for r in (core.router, runs.router, fuel.router, prediction.router, restrictions.router, issues.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health():
    try:
        v = get_client().status()
        valhalla = {"ok": True, "version": v.get("version")}
    except Exception as e:
        valhalla = {"ok": False, "error": str(e)}
    return {"ok": True, "valhalla": valhalla}
