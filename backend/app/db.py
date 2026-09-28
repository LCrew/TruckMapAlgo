import copy
import json

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine, select

from .config import DATABASE_URL, DEFAULT_SETTINGS, DEFAULT_TRUCKS

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


def get_session():
    with Session(engine) as session:
        yield session


def _add_missing_columns() -> None:
    """Minimal migration: add columns introduced after a table was created (SQLite ALTER TABLE ADD)."""
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in SQLModel.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            existing = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name in existing:
                    continue
                ddl_type = col.type.compile(engine.dialect)
                default = col.default.arg if col.default is not None and not callable(col.default.arg) else None
                if isinstance(default, bool):
                    default = int(default)
                clause = f" DEFAULT {default!r}" if default is not None else ""
                conn.execute(text(f'ALTER TABLE "{table.name}" ADD COLUMN "{col.name}" {ddl_type}{clause}'))


def init_db() -> None:
    from . import models  # noqa: F401  (register tables)
    from .fleet import normalize_truck

    SQLModel.metadata.create_all(engine)
    _add_missing_columns()
    with Session(engine) as s:
        if not s.exec(select(models.Truck)).first():
            for t in DEFAULT_TRUCKS:
                s.add(models.Truck(**t))
            s.commit()
        for t in s.exec(select(models.Truck)).all():  # give pre-fleet trucks a compartment
            normalize_truck(t)
            s.add(t)
        s.commit()


def _merge(base: dict, override: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_settings(s: Session) -> dict:
    from .models import Setting

    row = s.get(Setting, "app")
    stored = json.loads(row.value) if row else {}
    return _merge(DEFAULT_SETTINGS, stored)


def save_settings(s: Session, values: dict) -> dict:
    from .models import Setting

    merged = _merge(load_settings(s), values)
    row = s.get(Setting, "app") or Setting(key="app", value="{}")
    row.value = json.dumps(merged)
    s.add(row)
    s.commit()
    return merged
