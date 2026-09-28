"""Backend messages in English and Latvian.

Errors are raised as AppError(key, **params) and translated per request (X-Lang header,
falling back to Accept-Language). Plan warnings and unserved reasons are stored as
{"key", "params"} so saved runs can be shown in either language; `localize_plan`
adds the translated "text" when a plan is returned.
"""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse

LANGS = ("lv", "en")
DEFAULT_LANG = "lv"

MESSAGES: dict[str, dict[str, str]] = {
    # planning errors
    "truck_not_found": {"en": "Truck {id} not found", "lv": "Transportlīdzeklis {id} nav atrasts"},
    "no_orders": {"en": "No orders selected", "lv": "Nav izvēlēts neviens pasūtījums"},
    "geocode_failed": {"en": "Could not find these addresses: {items}", "lv": "Neizdevās atrast šīs adreses: {items}"},
    "none_fit_truck": {"en": "None of the selected orders fit this truck",
                       "lv": "Neviens no izvēlētajiem pasūtījumiem neietilpst šajā transportlīdzeklī"},
    "location_unreachable": {"en": "A location is not reachable by this truck: {detail}",
                             "lv": "Šis transportlīdzeklis nevar piekļūt kādai no vietām: {detail}"},
    "no_legal_route_any": {"en": "No order could be routed legally with this truck",
                           "lv": "Nevienam pasūtījumam nav atļauta maršruta ar šo transportlīdzekli"},
    "no_legal_route_leg": {"en": "No legal route for leg {leg} with {tons} t on board: {detail}",
                           "lv": "Posmam {leg} ar {tons} t kravu nav atļauta maršruta: {detail}"},
    "no_available_trucks": {"en": "No available trucks in the fleet", "lv": "Autoparkā nav pieejamu transportlīdzekļu"},
    "routing_engine_error": {"en": "Routing engine error: {detail}", "lv": "Maršrutēšanas servera kļūda: {detail}"},
    # generic API errors
    "order_not_found": {"en": "Order not found", "lv": "Pasūtījums nav atrasts"},
    "run_not_found": {"en": "Run not found", "lv": "Reiss nav atrasts"},
    "geocoder_error": {"en": "Address search error: {detail}", "lv": "Adrešu meklēšanas kļūda: {detail}"},
    "bad_fleet_csv": {"en": "Bad fleet CSV: {detail}. Columns: {columns}",
                      "lv": "Kļūda autoparka CSV failā: {detail}. Kolonnas: {columns}"},
    "bad_history_csv": {"en": "Bad CSV row {row}: {detail}", "lv": "Kļūda CSV faila {row}. rindā: {detail}"},
    "restrictions_zoom_in": {"en": "Zoom in: area too large for the online restriction lookup",
                             "lv": "Pietuviniet karti: apgabals ir par lielu ierobežojumu meklēšanai tiešsaistē"},
    # issue reporting
    "issues_not_configured": {
        "en": "Issue reporting is not configured on the server (GITHUB_TOKEN / GITHUB_REPO).",
        "lv": "Problēmu ziņošana serverī nav iestatīta (GITHUB_TOKEN / GITHUB_REPO)."},
    "issues_rate_limited": {"en": "Too many reports from this address. Please try again in a few minutes.",
                            "lv": "No šīs adreses nosūtīts pārāk daudz ziņojumu. Lūdzu, mēģiniet pēc dažām minūtēm."},
    "issues_invalid": {"en": "Please enter a title (3–120 characters) and a description (10+ characters).",
                       "lv": "Lūdzu, ievadiet virsrakstu (3–120 rakstzīmes) un aprakstu (vismaz 10 rakstzīmes)."},
    "issues_github_error": {"en": "GitHub did not accept the issue: {detail}",
                            "lv": "GitHub nepieņēma ziņojumu: {detail}"},
    # unserved reasons
    "exceeds_capacity": {"en": "exceeds truck capacity (weight, LDM or volume)",
                         "lv": "pārsniedz transportlīdzekļa ietilpību (svars, LDM vai tilpums)"},
    "no_route_to_order": {"en": "no legal truck route to pickup/delivery",
                          "lv": "nav atļauta kravas auto maršruta līdz iekraušanas/izkraušanas vietai"},
    # warnings
    "restriction_detour": {
        "en": "Leg {leg}: truck restrictions (height/weight/HGV bans) add {km} km vs. an unrestricted vehicle",
        "lv": "{leg}. posms: kravas auto ierobežojumi (augstums/svars/aizliegumi) pagarina ceļu par {km} km"},
    "order_split": {"en": "Order {ref} does not fit one tent and is split across tents",
                    "lv": "Pasūtījums {ref} neietilpst vienā tentā un ir sadalīts starp tentiem"},
    "tent_overflow": {"en": "Order #{id}: {pct}% does not fit any tent at the same time",
                      "lv": "Pasūtījums #{id}: {pct}% neietilpst nevienā tentā vienlaikus"},
    "fuel_stale": {"en": "Fuel price is stale: {source}", "lv": "Degvielas cena ir novecojusi: {source}"},
}


def tr(lang: str, key: str, **params) -> str:
    msg = MESSAGES.get(key)
    if not msg:
        return key
    text = msg.get(lang) or msg["en"]
    try:
        return text.format(**params)
    except (KeyError, IndexError):
        return text


def msg(key: str, **params) -> dict:
    """Language-neutral message stored in plan results."""
    return {"key": key, "params": params}


def request_lang(request: Request) -> str:
    lang = (request.headers.get("x-lang") or "").lower()[:2]
    if lang in LANGS:
        return lang
    accept = (request.headers.get("accept-language") or "").lower()
    for part in accept.split(","):
        code = part.split(";")[0].strip()[:2]
        if code in LANGS:
            return code
    return DEFAULT_LANG


class AppError(Exception):
    status_code = 400

    def __init__(self, key: str, status_code: int | None = None, **params):
        super().__init__(tr("en", key, **params))
        self.key, self.params = key, params
        if status_code:
            self.status_code = status_code


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": tr(request_lang(request), exc.key, **exc.params), "code": exc.key, "params": exc.params},
    )


def localize_plan(result: dict, lang: str) -> dict:
    """Add translated text to warnings and unserved reasons (also handles pre-i18n saved runs)."""
    def text(m):
        return tr(lang, m["key"], **m.get("params", {})) if isinstance(m, dict) else str(m)

    result["warnings"] = [
        {**w, "text": text(w)} if isinstance(w, dict) else {"key": None, "params": {}, "text": w}
        for w in result.get("warnings", [])
    ]
    for u in result.get("unserved", []):
        if "reason_key" in u:
            u["reason"] = tr(lang, u["reason_key"])
    if isinstance(result.get("loading"), dict):
        result["loading"]["warnings"] = [text(w) for w in result["loading"].get("warnings", [])]
    return result
