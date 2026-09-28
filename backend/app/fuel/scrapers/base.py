from __future__ import annotations

import re
from dataclasses import dataclass

import httpx

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)
PRICE_RE = re.compile(r"(\d+[.,]\d{2,3})")


@dataclass
class ScrapedPrice:
    brand: str
    fuel_type: str  # "DD" = standard diesel used for pricing; "DD+", "HVO", "95", "98", "LPG", ...
    price_eur_l: float
    location: str = ""
    source_url: str = ""

    @property
    def is_diesel(self) -> bool:
        return self.fuel_type in ("DD", "DD+", "HVO")


def parse_price(text: str) -> float | None:
    m = PRICE_RE.search(text or "")
    if not m:
        return None
    value = float(m.group(1).replace(",", "."))
    return value if 0.3 < value < 5.0 else None


class Scraper:
    brand: str = ""
    url: str = ""

    def parse(self, html: str) -> list[ScrapedPrice]:  # pragma: no cover - interface
        raise NotImplementedError

    def fetch(self) -> list[ScrapedPrice]:
        r = httpx.get(
            self.url,
            headers={"User-Agent": BROWSER_UA, "Accept-Language": "lv,en;q=0.8"},
            timeout=20,
            follow_redirects=True,
        )
        r.raise_for_status()
        prices = self.parse(r.text)
        if not prices:
            raise ValueError(f"{self.brand}: page layout changed, no prices parsed")
        return prices
