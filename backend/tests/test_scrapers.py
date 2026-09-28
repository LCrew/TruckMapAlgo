from pathlib import Path

import pytest

from app.fuel.scrapers import CircleKScraper, ViadaScraper, VirsiScraper

FIX = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize("scraper,fixture,expected_dd", [
    (CircleKScraper(), "circlek.html", 2.049),
    (VirsiScraper(), "virsi.html", 2.097),
    (ViadaScraper(), "viada.html", 2.067),
])
def test_parsers_extract_diesel(scraper, fixture, expected_dd):
    prices = scraper.parse((FIX / fixture).read_text(encoding="utf-8", errors="ignore"))
    dd = [p for p in prices if p.fuel_type == "DD"]
    assert len(dd) == 1
    assert dd[0].price_eur_l == pytest.approx(expected_dd)
    assert dd[0].is_diesel
    assert all(0.3 < p.price_eur_l < 5 for p in prices)
    assert {p.brand for p in prices} == {scraper.brand}
