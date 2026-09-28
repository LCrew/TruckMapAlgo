from bs4 import BeautifulSoup

from .base import ScrapedPrice, Scraper, parse_price

# Circle K product names -> normalized fuel type
NAMES = {
    "dmiles": "DD",
    "dmiles+": "DD+",
    "xtl": "HVO",
    "95miles": "95",
    "98miles+": "98",
    "autogāze": "LPG",
}


class CircleKScraper(Scraper):
    brand = "Circle K"
    url = "https://www.circlek.lv/degvielas-cenas"

    def parse(self, html: str) -> list[ScrapedPrice]:
        soup = BeautifulSoup(html, "lxml")
        out: list[ScrapedPrice] = []
        for tr in soup.select("table tr"):
            cells = [td.get_text(" ", strip=True).replace("\xa0", " ") for td in tr.find_all("td")]
            if len(cells) < 2:
                continue
            price_idx = next((i for i, c in enumerate(cells) if "EUR" in c and parse_price(c)), None)
            if price_idx is None or price_idx == 0:
                continue
            name = cells[price_idx - 1].strip().lower().replace(" ", "")
            fuel = NAMES.get(name)
            if not fuel:
                continue
            location = cells[price_idx + 1] if len(cells) > price_idx + 1 else ""
            out.append(ScrapedPrice(self.brand, fuel, parse_price(cells[price_idx]), location, self.url))
        return out
