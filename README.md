# Baltic Truck Planner

Truck route optimizer and transport pricing for Latvia, Lithuania and Estonia.

- **Truck-legal routing** on OpenStreetMap data with a self-hosted [Valhalla](https://github.com/valhalla/valhalla) router. It avoids low bridges (`maxheight`), weight-limited roads and bridges (`maxweight`, `maxaxleload`), length and width limits, HGV bans (`hgv=no`, such as Riga Old Town) and hazmat restrictions. Each leg is routed with the **actual weight on board at that point**.
- **Fleet of fixed units:** each unit has plates, availability, its own fuel rating (L/100 km empty and full), dimensions for the router, and 1–3 tent compartments with their own loading metres, m³ and max load. Truck + drawbar trailer units ([truck]-[tent]-[tent]) have two tents.
- **Best truck:** *Find best truck* plans the selected orders on every available unit and ranks them by orders served, then run cost. *Use* plans the route with that unit.
- **Tent loading plan:** each order is assigned to a tent for its whole time on board, respecting each tent's LDM, volume and weight. An order is split across tents only when no whole-order arrangement exists (exact search first, then a splitting fallback).
- **Multi-order optimization** (OR-Tools pickup & delivery) with LDM, weight and volume capacity. When the orders don't fit in one load, it plans several trips from the depot.
- **Per-order pricing by ratio:** the run cost is split by *effective LDM × km carried* (see below).
- **Live Latvian diesel prices** are scraped every 6 h from Circle K, Virši and Viada.
- **Price prediction:** cost-plus until 30 invoiced prices exist, then a gradient-boosting model with a 10–90 % range.
- The depot is configurable. The default is **Spodrības iela 1, Dobele**.

## Install on a Linux server (Ubuntu / Debian)

Needs about 4 GB RAM and 5 GB free disk. The first setup takes 15–30 minutes, mostly for building the map.

```bash
# 1. Docker Engine + Compose plugin, git, curl
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker   # use docker without sudo in this shell

# 2. Get the code
git clone https://github.com/LCrew/TruckMapAlgo.git
cd TruckMapAlgo

# 3. Configure: the web app port (and optionally the GitHub token for "Report an issue")
cp .env.example .env
sed -i 's/^APP_PORT=.*/APP_PORT=8081/' .env

# 4. Download map data, build routing tiles, start everything (safe to re-run)
./setup.sh

# 5. If a firewall is active, open the port
sudo ufw allow 8081/tcp
```

Open `http://<server-ip>:8081`. Only the web app port is public; the backend (8000) and the routing engine (8002) listen on 127.0.0.1.

Useful commands:

| Task | Command |
|---|---|
| Status / logs | `docker compose ps` · `docker compose logs -f backend` |
| **Start** (after setup, e.g. after `docker compose down`) | `./start.sh` |
| Stop | `docker compose down` |
| Update the app | `git pull && docker compose up -d --build` |
| Refresh road data (e.g. weekly) | `./valhalla/scripts/fetch_osm.sh && ./valhalla/scripts/rebuild_tiles.sh` |
| Back up data | copy `backend/data/truckmap.db` |

The containers restart automatically after a reboot (`restart: unless-stopped`).

On macOS or Windows, install Docker Desktop and run the same steps from step 2. The app is on `http://localhost:<APP_PORT>` (default 5173 without a `.env`).

Try it: go to **Autoparks / Fleet → Import fleet CSV** and pick `samples/fleet.csv` (one row per unit; `tent2_*` empty for single-trailer units; re-importing a plate updates it). Then use **Orders → Import orders CSV** with `samples/orders.csv`, and **Planner → All → Optimize route**.

## Language

The whole UI is available in **Latvian (default) and English**. Switch with LV/EN in the header; the choice is remembered per browser. Backend errors and plan warnings are translated too. Saved runs store warnings as message codes, so they show in whichever language is active.

## Reporting issues from the app

The **Report an issue** button in the header opens a form (bug, idea or question). It creates an issue in this GitHub repository, labelled `from-app`, with optional technical context (page, language, browser, screen size).

- To enable direct sending, put a fine-grained GitHub token with only **Issues: read & write** on this repository into `.env` (`GITHUB_TOKEN=...`), then run `docker compose up -d backend`. The token stays on the server.
- Without a token, the form offers GitHub's own "new issue" page, prefilled (needs a GitHub account).
- Protections: 5 reports per 10 minutes per client, input length limits, a honeypot field against bots, and @-mentions neutralised.
- Issues are public: the form warns people not to include customer names, prices or personal data.

## How the price is calculated

**Run cost** = fuel + driver + tolls + wear + fixed + margin (all editable under *Settings*, and each truck can override them):

| Component | Formula |
|---|---|
| Fuel | Σ legs km × L/100km × diesel €/L (net of VAT). Consumption is interpolated between empty and full by the weight on board for each leg. |
| Driver | (driving + stop handling + EU 561/2006 breaks) × €/h, plus per diem × days |
| Tolls | per country from the route: LV/EE time-based vignette × days, LT € per km (rates are editable) |
| Wear | km × €/km |
| Fixed | days × €/day (leasing, insurance, admin) |
| Margin | % of subtotal |

**Per-order split (ratios):**

1. **Effective LDM** = max(LDM, m³ ÷ trailer m³-per-LDM). Bulky, light cargo pays for the space it takes.
2. **km counted** = km the order is on board, capped at its direct pickup→delivery distance. An order dropped off early pays less, but nobody pays for detours made for other orders.
3. **Share** = effective LDM × km counted ÷ sum over all orders.
4. Each order pays its own loading and unloading time directly. Everything else, including empty running and the return trip, is split by share, so the run is fully recovered. Settings has an option to show unused trailer capacity as a separate line instead.
5. **No order pays more than shipping it alone.** Its *standalone cost* is shown next to the allocated cost, together with the saving from combining.

**Prediction:** save a run, then enter the invoiced price on the Orders page, or import historical prices as CSV. With 30 or more samples, press *Train model*.

## Project layout

```
docker-compose.yml        valhalla + backend (FastAPI, 127.0.0.1:8000) + frontend (nginx, APP_PORT)
setup.sh                  one-shot install: map data, tiles, services
valhalla/scripts/         fetch_osm.sh, rebuild_tiles.sh, wait_and_limit.sh, apply_limits.py
backend/app/
  routing/valhalla.py     truck costing client (route, matrix, km per country)
  routing/optimizer.py    OR-Tools pickup & delivery with capacities
  routing/geocode.py      Nominatim (LV/LT/EE), cached
  pricing/cost_model.py   run cost
  pricing/allocation.py   per-order ratio split
  pricing/predictor.py    ML price model
  fuel/scrapers/          Circle K, Virši, Viada parsers
  planner.py              orchestrates a plan; fleet comparison
  fleet.py                fleet units, tents, loading plan
  i18n.py                 backend messages (LV/EN)
  api/issues.py           "Report an issue" → GitHub
backend/tests/            pytest (pricing, optimizer, scrapers with saved HTML)
frontend/src/             React + Leaflet UI (lib/i18n.tsx: all UI strings, LV/EN)
samples/                  demo orders and fleet CSV templates
```

## Development

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest -q
.venv/bin/uvicorn app.main:app --reload --port 8000     # needs Valhalla on :8002

cd frontend && npm install && npm run dev               # proxies /api to :8000
```

## Notes and limits

- The routing is only as good as the OSM tags. Bridges without a `maxheight`/`maxweight` tag are not known to the router. **Show truck restrictions** on the map lists the tagged restrictions in view.
- The restriction overlay is served from `valhalla/restrictions/restrictions.geojsonseq`. That file is extracted from the same OSM data as the router, so there are no Overpass calls and no rate limits. The backend reloads it when `fetch_osm.sh` rewrites it. If the file is missing, the backend falls back to Overpass, caching results per 0.25° tile in SQLite for 7 days and backing off on 429/504.
- Toll rates are approximate defaults. Check them against current VSAA (LV), LT and Transpordiamet (EE) tariffs under Settings.
- If a fuel station changes its page layout, its scraper fails and is logged, and the remaining sources are used. If all fail, the last known price is used and marked stale in the header.
- Neste LV is not scraped: its price table is rendered client-side.
