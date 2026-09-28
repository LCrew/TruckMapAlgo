from bs4 import BeautifulSoup

from .base import ScrapedPrice, Scraper, parse_price

# data-type attribute on Virši price cards -> normalized fuel type.
# "ad" is a different product from standard diesel, so it is not treated as DD.
TYPES = {"dd": "DD", "95e": "95", "98e": "98", "lpg": "LPG", "cng": "CNG", "ad": "AD"}


class VirsiScraper(Scraper):
    brand = "Virši"
    url = "https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas"

    def parse(self, html: str) -> list[ScrapedPrice]:
        soup = BeautifulSoup(html, "lxml")
        out: list[ScrapedPrice] = []
        for card in soup.select(".price-card[data-type]"):
            fuel = TYPES.get(card["data-type"].lower())
            price_el = card.select_one(".price")
            if not fuel or not price_el:
                continue
            spans = price_el.find_all("span")
            price = parse_price(spans[-1].get_text() if spans else price_el.get_text())
            if price is None:
                continue
            addr = card.select_one(".address")
            out.append(ScrapedPrice(self.brand, fuel, price, addr.get_text(" ", strip=True) if addr else "", self.url))
        return out
