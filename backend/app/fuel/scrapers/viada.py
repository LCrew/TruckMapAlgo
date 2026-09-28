from bs4 import BeautifulSoup

from .base import ScrapedPrice, Scraper, parse_price

# Viada labels fuels with images; map by file name prefix (longest match first).
IMAGES = [
    ("petrol_95ectoplus", "95+"),
    ("petrol_95ecto", "95"),
    ("petrol_98", "98"),
    ("petrol_d_ecto", "DD"),  # standard "ecto" diesel
    ("petrol_d", "DD+"),
    ("petrol_e85", "E85"),
    ("gaze", "LPG"),
]


class ViadaScraper(Scraper):
    brand = "Viada"
    url = "https://www.viada.lv/zemakas-degvielas-cenas/"

    def parse(self, html: str) -> list[ScrapedPrice]:
        soup = BeautifulSoup(html, "lxml")
        out: list[ScrapedPrice] = []
        for tr in soup.select("table tr"):
            tds = tr.find_all("td")
            img = tr.find("img")
            if len(tds) < 2 or not img:
                continue
            fname = img.get("src", "").rsplit("/", 1)[-1].lower()
            fuel = next((f for prefix, f in IMAGES if fname.startswith(prefix)), None)
            price = parse_price(tds[1].get_text())
            if not fuel or price is None:
                continue
            location = tds[2].get_text(" ", strip=True) if len(tds) > 2 else ""
            out.append(ScrapedPrice(self.brand, fuel, price, location[:500], self.url))
        return out
