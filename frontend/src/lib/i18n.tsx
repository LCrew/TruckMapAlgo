/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useContext, useState } from "react";

export type Lang = "lv" | "en";

const en = {
  appName: "Baltic Truck Planner",
  "tab.Planner": "Planner", "tab.Orders": "Orders", "tab.Trucks": "Fleet", "tab.Fuel": "Fuel", "tab.Settings": "Settings",
  routerReady: "Router ready", routerOffline: "Router offline",
  // common
  close: "Close ✕", cancel: "Cancel", save: "Save", saved: "saved", delete: "Delete", edit: "Edit", total: "Total",
  order: "Order", orders: "Orders", fuel: "Fuel", km: "km", na: "n/a", empty: "empty", depot: "Depot",
  day1: "day", dayN: "days", brand: "Brand", importFailed: "Import failed: {e}",
  // planner
  truck: "Truck", unavailableSuffix: " (unavailable)", startEnd: "Start / end:",
  openOrders: "Open orders ({n})", all: "All", none: "None", addOrder: "+ Order",
  reference: "Reference", customer: "Customer", pickupEmptyDepot: "Pickup (empty = depot)", pickOnMap: "pick on map",
  deliveryAddress: "Delivery address *", streetCity: "Street, city", pallets: "Pallets",
  adr: "ADR / dangerous goods", addOrderBtn: "Add order", located: "✓ located",
  noOpenOrders: "No open orders. Add one or import a CSV on the Orders tab.",
  selectedSummary: "Selected {n}: {ldm} LDM of {cap} · {t} t of {tcap} t",
  overCapacity: " — over capacity: multiple trips will be planned",
  findBestTitle: "Plan the selected orders on every available unit and rank by run cost",
  comparing: "Comparing fleet…", findBest: "Find best truck", optimizing: "Optimizing…", optimize: "Optimize route",
  saveRunTitle: "Plan again and save as a run; orders become 'planned'", saveRun: "Save as run",
  savedRuns: "Saved runs", noSavedRuns: "No saved runs yet.",
  pickHint: "Click the map to set the {target} location", pickupLoc: "pickup", deliveryLoc: "delivery",
  deliveryRequired: "Delivery address is required",
  bestTruckFor: "Best truck for {n} orders", colUnit: "Unit", colTrips: "Trips", colDriving: "Driving",
  colUtilisation: "Utilisation", colRunCost: "Run cost", colVsBest: "vs best", cheapest: "cheapest",
  tent1: "{n} tent", tentN: "{n} tents", splitAcross: " · {n} order split across tents", cantTake: "Can't take: {ids}",
  use: "Use",
  rankedNote: "Ranked by orders served, then total run cost (fuel by each unit's rating, driver, tolls, wear, fixed and margin). Identical units are planned once.",
  runN: "Run #{id}", notSaved: "Route plan (not saved)", orderNotPlanned: "Order #{id} not planned: {reason}",
  itinerary: "Itinerary ({stops} stops, {legs} legs)", colStop: "Stop", colLoadAfter: "Load after",
  colNextLeg: "Next leg", colGross: "Gross", colCountries: "Countries",
  kindLoad: "LOAD", kindUnload: "UNLOAD", kindDepot: "DEPOT", forRestrictions: "+{km} km for restrictions",
  // map
  depotTooltip: "Depot: {addr}", zoomInRestr: "Zoom in (level 10+) to see truck restrictions",
  loadingRestr: "Loading restrictions…", restrSummary: "{blocking} restrictions block this truck here · {total} total",
  restrTruncated: " (showing {n}, zoom in for all)", restrPartial: " · some areas still loading, pan again shortly",
  restriction: "Restriction", blocksTruck: "Blocks this truck", legN: "Leg {n}",
  onBoard: "On board: {t} t / {ldm} LDM (gross {g} t)", consumption: "Consumption {c} L/100km",
  detourTooltip: "+{km} km detour due to truck restrictions", stopLoad: "Load", stopUnload: "Unload",
  showRestr: "Show truck restrictions", hideRestr: "Hide truck restrictions", loadOnBoard: "Load on board",
  "r.max height": "max height", "r.max weight": "max weight", "r.max axle load": "max axle load",
  "r.max length": "max length", "r.max width": "max width", "r.no HGV": "no HGV",
  // cost breakdown
  kpiDistance: "Distance", kpiDriving: "Driving", workDays: "work {w} · {d} {days}", fuelSub: "DD €{p} pump · €{n} net",
  kpiUtil: "Utilisation", utilSub: "LDM·km used vs capacity", perKm: "{v}/km", kpiSaved: "Saved vs solo",
  ordersCombined: "{n} orders combined", runCostBreakdown: "Run cost breakdown",
  "c.fuel": "Fuel", "c.driver": "Driver", "c.tolls": "Road tolls", "c.wear": "Wear & maintenance",
  "c.fixed": "Fixed (per day)", "c.margin": "Margin", unusedCap: "of which unused capacity",
  pricePerOrder: "Price per order", colEffLdm: "Eff. LDM", colKmCounted: "km counted",
  colKmCountedTitle: "km counted for the share: km on board, capped at the direct pickup→delivery distance",
  colShare: "Share", colAllocated: "Allocated", colIfSolo: "If solo", colSaving: "Saving", colPredicted: "Predicted price",
  kmOnBoard: "{km} on board", methodCostPlus: "cost-plus", methodMl: "ML ({n} samples)",
  shareExplain: "Share = order's effective LDM (max of LDM and volume ÷ {m3} m³/LDM) × km it spends on board (capped at its direct pickup→delivery distance, so nobody pays for detours made for other orders), relative to all orders. Each order pays its own loading/unloading time; the rest of the run, including empty running, is split by share. No order is charged more than it would cost to ship alone.",
  // loading plan
  loadingPlan: "Loading plan · {tents}", loadingM: "Loading m", volume: "Volume", weight: "Weight",
  peaksNote: "Peaks are the fullest point along the route (orders loaded later can reuse space freed by earlier deliveries). Orders stay in one tent unless no tent has room for them.",
  // orders page
  allStatuses: "All statuses", "status.open": "open", "status.planned": "planned", "status.delivered": "delivered",
  importOrdersCsv: "Import orders CSV",
  ordersCsvHelp: "CSV columns: reference, customer, pickup_address (empty = depot), delivery_address, ldm, volume_m3, weight_kg, pallets, hazmat",
  importedOrders: "Imported {n} orders", importedHistory: "Imported {n} historical prices",
  colStatus: "Status", colLoad: "Load", colPredictedShort: "Predicted", colInvoiced: "Invoiced price", runRef: "run #{id}",
  priceCellTitle: "Invoiced price: used to train the price model", planFirst: "Plan and save a run first",
  modelTitle: "Price prediction model", trained: "Trained", notTrained: "Not trained: using cost-plus prices",
  samples: "{n} / {r} priced samples", cvError: "CV error ±{v}", trainedAt: "trained {d}",
  modelExplain: "Enter the invoiced price for planned orders above, or import historical orders. With {r}+ samples a gradient-boosting model learns market prices from distance, load, share, destination, fuel price, season and how many orders shared the truck, and shows a 10–90% range.",
  trainModel: "Train model", importHistory: "Import price history CSV", trainedMsg: "Model trained on {n} samples",
  needSamples: "Need {r} samples, have {n}",
  // fleet page
  fleetTitle: "Fleet · {n} units, {a} available", importFleet: "Import fleet CSV", addUnit: "+ Add unit",
  fleetCsvNote: "(rows with an existing plate update that unit)", fleetImported: "Imported fleet: {c} new, {u} updated",
  available: "available", unitName: "Unit name", truckPlate: "Truck plate", trailerPlate: "Trailer plate",
  optional: "optional", emissionClass: "Emission class", compartments: "Load compartments (tents)",
  presetSemi: "Preset: semi-trailer", presetTwo: "Preset: truck + trailer (2 tents)", addTent: "+ Tent",
  tentName: "Tent {n}", truckTent: "Truck tent", trailerTent: "Trailer tent", colTent: "Tent",
  colLoadingM: "Loading m", colVolumeM3: "Volume m³", colMaxLoadT: "Max load t", remove: "Remove", unitTotal: "Unit total",
  payloadLimited: "The tents can carry {a} t together, but the combination's legal payload of {b} t limits the total.",
  vehicleRouter: "Vehicle for the router", fHeight: "Height m", fWidth: "Width m", fLength: "Total length m",
  fEmpty: "Empty weight t (whole combo)", fPayload: "Legal payload t (whole combo)", fAxles: "Axles",
  fAxleLoad: "Max axle load t", fuelRating: "Fuel rating", fL100Empty: "L/100km empty", fL100Full: "L/100km fully loaded",
  costOverrides: "Cost overrides (empty = global setting)", fWear: "Wear €/km", fFixed: "Fixed €/day",
  fDriver: "Driver €/h", global: "global", saveUnit: "Save unit", duplicate: "Duplicate", copySuffix: "(copy)",
  gvwNote: "GVW {g} t. Height, width, length, per-leg gross weight and axle load go to the router, which avoids low bridges, weight limits and HGV bans for this unit.",
  // fuel page
  latvianFuelPrices: "Latvian fuel prices", refreshNow: "Refresh now", scraping: "Scraping…",
  dieselForPricing: "Diesel used for pricing", modeLabel: "mode: {m}", lastUpdate: "Last update",
  staleCheck: "stale: check the scrapers", refreshEvery: "refreshes every 6 h", updated: "Updated: {ok}",
  failedList: " · failed: {f}", colWhere: "Where (lowest price)", colFetched: "Fetched", ddDiesel: "DD (diesel)",
  fuelNote: "Scraped from Circle K, Virši and Viada public price pages. Pump prices include VAT; costing uses the net price when VAT exclusion is on in Settings.",
  historyTitle: "Diesel price history", historyEmpty: "History builds up as prices are scraped every 6 hours.",
  noScrapedYet: "no scraped prices yet; using the manual price",
  "mode.min": "lowest", "mode.avg": "average", "mode.brand": "brand", "mode.manual": "manual",
  "mode.manual-fallback": "manual (fallback)",
  // settings page
  saveSettings: "Save settings", depotTitle: "Depot (start and end point)",
  returnToDepot: "Return to depot at the end of each run", resetDobele: "Reset to Dobele",
  fuelSource: "Fuel price source", modeField: "Mode", modeMin: "Lowest scraped diesel", modeAvg: "Average of stations",
  modeBrand: "Specific brand", modeManual: "Manual price", excludeVat: "Exclude VAT from fuel cost (VAT is reclaimed)",
  costParams: "Cost parameters", "s.driver_hourly_rate": "Driver cost €/h", "s.driver_per_diem": "Driver per diem €/day",
  "s.handling_minutes_per_stop": "Loading/unloading min per stop", "s.max_driving_hours_per_day": "Max driving h/day",
  "s.break_minutes_per_4_5h": "Break min per 4.5 h", "s.wear_eur_per_km": "Wear & maintenance €/km",
  "s.fixed_eur_per_day": "Fixed cost €/day", "s.margin_pct": "Margin %", "s.vat_rate": "VAT rate",
  "s.fuel_manual_price": "Manual diesel price €/L",
  unusedSeparately: "Show unused trailer capacity as a separate cost instead of spreading it over the orders",
  tollsTitle: "Road tolls for heavy goods vehicles", colCountry: "Country", colType: "Type",
  perDay: "€ per day (vignette)", perKmToll: "€ per km",
  tollsNote: "Defaults are approximate N3 truck rates. Check them against the current official tariffs (LV: VSAA vinjete, LT: distance-based toll, EE: Transpordiamet road usage charge).",
  // issues
  reportIssue: "Report an issue", issueKind: "Type", kindBug: "Bug / error", kindIdea: "Idea / improvement",
  kindQuestion: "Question", issueTitle: "Title", issueTitlePh: "Short summary",
  issueDesc: "What happened? What did you expect?", issueDescPh: "Steps, what you saw, what you expected…",
  includeContext: "Include technical details (page, language, browser, screen size)",
  publicWarning: "Issues are public on GitHub: do not include customer names, prices or personal data.",
  send: "Send", sending: "Sending…", issueCreated: "Thank you! Issue #{n} was created.", viewOnGithub: "View on GitHub",
  notConfiguredFallback: "Direct sending isn't set up on this server. You can open the issue on GitHub instead (needs a GitHub account):",
  openOnGithub: "Open on GitHub",
} as const;

export type Key = keyof typeof en;

const lv: Record<Key, string> = {
  appName: "Baltijas kravu plānotājs",
  "tab.Planner": "Plānotājs", "tab.Orders": "Pasūtījumi", "tab.Trucks": "Autoparks", "tab.Fuel": "Degviela",
  "tab.Settings": "Iestatījumi",
  routerReady: "Maršrutētājs gatavs", routerOffline: "Maršrutētājs nepieejams",
  close: "Aizvērt ✕", cancel: "Atcelt", save: "Saglabāt", saved: "saglabāts", delete: "Dzēst", edit: "Labot",
  total: "Kopā", order: "Pasūtījums", orders: "Pasūtījumi", fuel: "Degviela", km: "km", na: "n/d", empty: "tukšs",
  depot: "Bāze", day1: "diena", dayN: "dienas", brand: "Zīmols", importFailed: "Importēšana neizdevās: {e}",
  truck: "Transportlīdzeklis", unavailableSuffix: " (nav pieejams)", startEnd: "Sākums / beigas:",
  openOrders: "Atvērtie pasūtījumi ({n})", all: "Visi", none: "Neviens", addOrder: "+ Pasūtījums",
  reference: "Numurs", customer: "Klients", pickupEmptyDepot: "Iekraušana (tukšs = bāze)", pickOnMap: "izvēlēties kartē",
  deliveryAddress: "Piegādes adrese *", streetCity: "Iela, pilsēta", pallets: "Paletes",
  adr: "ADR / bīstamā krava", addOrderBtn: "Pievienot pasūtījumu", located: "✓ atrasts",
  noOpenOrders: "Nav atvērtu pasūtījumu. Pievienojiet jaunu vai importējiet CSV cilnē Pasūtījumi.",
  selectedSummary: "Izvēlēti {n}: {ldm} no {cap} LDM · {t} no {tcap} t",
  overCapacity: " — pārsniegta ietilpība: tiks plānoti vairāki reisi",
  findBestTitle: "Saplānot izvēlētos pasūtījumus ar katru pieejamo transportlīdzekli un sakārtot pēc reisa izmaksām",
  comparing: "Salīdzina autoparku…", findBest: "Atrast izdevīgāko auto", optimizing: "Optimizē…",
  optimize: "Optimizēt maršrutu", saveRunTitle: "Saplānot vēlreiz un saglabāt kā reisu; pasūtījumi kļūst “plānoti”",
  saveRun: "Saglabāt reisu", savedRuns: "Saglabātie reisi", noSavedRuns: "Vēl nav saglabātu reisu.",
  pickHint: "Noklikšķiniet kartē, lai iestatītu {target} vietu", pickupLoc: "iekraušanas", deliveryLoc: "piegādes",
  deliveryRequired: "Piegādes adrese ir obligāta",
  bestTruckFor: "Izdevīgākais auto {n} pasūtījumiem", colUnit: "Vienība", colTrips: "Reisi", colDriving: "Braukšana",
  colUtilisation: "Noslodze", colRunCost: "Reisa izmaksas", colVsBest: "pret labāko", cheapest: "lētākais",
  tent1: "{n} tents", tentN: "{n} tenti", splitAcross: " · {n} pasūtījums sadalīts starp tentiem",
  cantTake: "Nevar paņemt: {ids}", use: "Izmantot",
  rankedNote: "Sakārtots pēc apkalpoto pasūtījumu skaita, tad pēc reisa kopējām izmaksām (degviela pēc katra auto patēriņa, vadītājs, ceļu nodevas, nolietojums, pastāvīgās izmaksas un uzcenojums). Vienādas vienības tiek plānotas vienreiz.",
  runN: "Reiss #{id}", notSaved: "Maršruta plāns (nav saglabāts)", orderNotPlanned: "Pasūtījums #{id} nav saplānots: {reason}",
  itinerary: "Maršruta gaita ({stops} pieturas, {legs} posmi)", colStop: "Pietura", colLoadAfter: "Krava pēc",
  colNextLeg: "Nākamais posms", colGross: "Pilna masa", colCountries: "Valstis",
  kindLoad: "IEKRAUT", kindUnload: "IZKRAUT", kindDepot: "BĀZE", forRestrictions: "+{km} km ierobežojumu dēļ",
  depotTooltip: "Bāze: {addr}", zoomInRestr: "Pietuviniet karti (10+ līmenis), lai redzētu kravas auto ierobežojumus",
  loadingRestr: "Ielādē ierobežojumus…", restrSummary: "{blocking} ierobežojumi šeit attiecas uz šo auto · kopā {total}",
  restrTruncated: " (rāda {n}, pietuviniet, lai redzētu visus)", restrPartial: " · daļa apgabalu vēl ielādējas, pēc brīža pārvietojiet karti",
  restriction: "Ierobežojums", blocksTruck: "Šim auto aizliegts", legN: "{n}. posms",
  onBoard: "Kravā: {t} t / {ldm} LDM (pilna masa {g} t)", consumption: "Patēriņš {c} L/100km",
  detourTooltip: "+{km} km apbraukšana kravas auto ierobežojumu dēļ", stopLoad: "Iekraut", stopUnload: "Izkraut",
  showRestr: "Rādīt kravas auto ierobežojumus", hideRestr: "Slēpt kravas auto ierobežojumus", loadOnBoard: "Krava",
  "r.max height": "maks. augstums", "r.max weight": "maks. masa", "r.max axle load": "maks. ass slodze",
  "r.max length": "maks. garums", "r.max width": "maks. platums", "r.no HGV": "kravas auto aizliegts",
  kpiDistance: "Attālums", kpiDriving: "Braukšana", workDays: "darbs {w} · {d} {days}",
  fuelSub: "DD €{p} stacijā · €{n} bez PVN", kpiUtil: "Noslodze", utilSub: "izmantotie LDM·km pret ietilpību",
  perKm: "{v}/km", kpiSaved: "Ietaupījums pret atsevišķu vešanu", ordersCombined: "{n} pasūtījumi apvienoti",
  runCostBreakdown: "Reisa izmaksu sadalījums",
  "c.fuel": "Degviela", "c.driver": "Vadītājs", "c.tolls": "Ceļu nodevas", "c.wear": "Nolietojums un apkope",
  "c.fixed": "Pastāvīgās (dienā)", "c.margin": "Uzcenojums", unusedCap: "t.sk. neizmantotā ietilpība",
  pricePerOrder: "Cena katram pasūtījumam", colEffLdm: "Efekt. LDM", colKmCounted: "Uzskaitītie km",
  colKmCountedTitle: "Daļai uzskaitītie km: km kravā, bet ne vairāk kā tiešais attālums no iekraušanas līdz piegādei",
  colShare: "Daļa", colAllocated: "Piešķirts", colIfSolo: "Atsevišķi", colSaving: "Ietaupījums",
  colPredicted: "Prognozētā cena", kmOnBoard: "{km} kravā", methodCostPlus: "izmaksas + uzcenojums",
  methodMl: "ML ({n} paraugi)",
  shareExplain: "Daļa = pasūtījuma efektīvie LDM (lielākais no LDM un tilpums ÷ {m3} m³/LDM) × km, ko tas pavada kravā (ne vairāk kā tiešais attālums no iekraušanas līdz piegādei, lai neviens nemaksātu par citu pasūtījumu dēļ veiktiem līkumiem), attiecībā pret visiem pasūtījumiem. Katrs pasūtījums maksā par savu iekraušanas/izkraušanas laiku; pārējās reisa izmaksas, ieskaitot tukšgaitu, sadala pēc daļas. Nevienam pasūtījumam netiek aprēķināts vairāk, nekā maksātu tā atsevišķa vešana.",
  loadingPlan: "Iekraušanas plāns · {tents}", loadingM: "Iekr. m", volume: "Tilpums", weight: "Svars",
  peaksNote: "Maksimumi ir noslogotākais brīdis maršrutā (vēlāk iekrautie pasūtījumi var izmantot vietu, kas atbrīvota pēc agrākām piegādēm). Pasūtījumi paliek vienā tentā, ja vien kādā tentā ir vieta.",
  allStatuses: "Visi statusi", "status.open": "atvērts", "status.planned": "plānots", "status.delivered": "piegādāts",
  importOrdersCsv: "Importēt pasūtījumus (CSV)",
  ordersCsvHelp: "CSV kolonnas: reference, customer, pickup_address (tukšs = bāze), delivery_address, ldm, volume_m3, weight_kg, pallets, hazmat",
  importedOrders: "Importēti pasūtījumi: {n}", importedHistory: "Importētas vēsturiskās cenas: {n}",
  colStatus: "Statuss", colLoad: "Krava", colPredictedShort: "Prognoze", colInvoiced: "Rēķina cena", runRef: "reiss #{id}",
  priceCellTitle: "Rēķinā norādītā cena: tiek izmantota cenu modeļa apmācībai",
  planFirst: "Vispirms saplānojiet un saglabājiet reisu",
  modelTitle: "Cenu prognozes modelis", trained: "Apmācīts", notTrained: "Nav apmācīts: izmanto izmaksas + uzcenojumu",
  samples: "{n} / {r} paraugi ar cenām", cvError: "Kļūda ±{v}", trainedAt: "apmācīts {d}",
  modelExplain: "Ievadiet rēķina cenu plānotajiem pasūtījumiem augstāk vai importējiet vēsturiskos pasūtījumus. Ar {r}+ paraugiem gradient-boosting modelis iemācās tirgus cenas no attāluma, kravas, daļas, galamērķa, degvielas cenas, sezonas un tā, cik pasūtījumu dalīja auto, un parāda 10–90% diapazonu.",
  trainModel: "Apmācīt modeli", importHistory: "Importēt cenu vēsturi (CSV)", trainedMsg: "Modelis apmācīts ar {n} paraugiem",
  needSamples: "Nepieciešami {r} paraugi, ir {n}",
  fleetTitle: "Autoparks · {n} vienības, pieejamas {a}", importFleet: "Importēt autoparku (CSV)",
  addUnit: "+ Pievienot vienību", fleetCsvNote: "(rindas ar esošu numurzīmi atjauno šo vienību)",
  fleetImported: "Autoparks importēts: {c} jaunas, {u} atjaunotas",
  available: "pieejams", unitName: "Vienības nosaukums", truckPlate: "Auto numurs", trailerPlate: "Piekabes numurs",
  optional: "nav obligāts", emissionClass: "Emisiju klase", compartments: "Kravas nodalījumi (tenti)",
  presetSemi: "Sagatave: puspiekabe", presetTwo: "Sagatave: auto + piekabe (2 tenti)", addTent: "+ Tents",
  tentName: "Tents {n}", truckTent: "Auto tents", trailerTent: "Piekabes tents", colTent: "Tents",
  colLoadingM: "Iekr. metri", colVolumeM3: "Tilpums m³", colMaxLoadT: "Maks. krava t", remove: "Noņemt",
  unitTotal: "Kopā vienībai",
  payloadLimited: "Tenti kopā var pārvadāt {a} t, bet sastāva atļautā kravnesība {b} t ierobežo kopējo.",
  vehicleRouter: "Parametri maršrutēšanai", fHeight: "Augstums m", fWidth: "Platums m", fLength: "Kopējais garums m",
  fEmpty: "Pašmasa t (viss sastāvs)", fPayload: "Atļautā kravnesība t (viss sastāvs)", fAxles: "Asis",
  fAxleLoad: "Maks. ass slodze t", fuelRating: "Degvielas patēriņš", fL100Empty: "L/100km tukšam",
  fL100Full: "L/100km pilnā kravā", costOverrides: "Individuālās izmaksas (tukšs = vispārējais iestatījums)",
  fWear: "Nolietojums €/km", fFixed: "Pastāvīgās €/dienā", fDriver: "Vadītājs €/h", global: "vispārējais",
  saveUnit: "Saglabāt vienību", duplicate: "Dublēt", copySuffix: "(kopija)",
  gvwNote: "Pilna masa {g} t. Augstums, platums, garums, posma pilnā masa un ass slodze tiek nodoti maršrutētājam, kas šai vienībai apiet zemus tiltus, masas ierobežojumus un kravas auto aizliegumus.",
  latvianFuelPrices: "Degvielas cenas Latvijā", refreshNow: "Atjaunot tagad", scraping: "Ielādē…",
  dieselForPricing: "Aprēķinos izmantotā dīzeļdegviela", modeLabel: "režīms: {m}", lastUpdate: "Pēdējā atjaunošana",
  staleCheck: "novecojusi: pārbaudiet cenu avotus", refreshEvery: "atjaunojas ik pēc 6 h", updated: "Atjaunots: {ok}",
  failedList: " · neizdevās: {f}", colWhere: "Kur (zemākā cena)", colFetched: "Iegūts", ddDiesel: "DD (dīzeļdegviela)",
  fuelNote: "Cenas iegūtas no Circle K, Virši un Viada publiskajām cenu lapām. Stacijas cenas ir ar PVN; aprēķinos izmanto cenu bez PVN, ja tas ieslēgts iestatījumos.",
  historyTitle: "Dīzeļdegvielas cenu vēsture", historyEmpty: "Vēsture veidojas, cenas iegūstot ik pēc 6 stundām.",
  noScrapedYet: "cenas vēl nav iegūtas; izmanto manuālo cenu",
  "mode.min": "zemākā", "mode.avg": "vidējā", "mode.brand": "zīmols", "mode.manual": "manuālā",
  "mode.manual-fallback": "manuālā (rezerves)",
  saveSettings: "Saglabāt iestatījumus", depotTitle: "Bāze (sākuma un beigu punkts)",
  returnToDepot: "Katra reisa beigās atgriezties bāzē", resetDobele: "Atjaunot uz Dobeli",
  fuelSource: "Degvielas cenas avots", modeField: "Režīms", modeMin: "Zemākā iegūtā dīzeļdegvielas cena",
  modeAvg: "Staciju vidējā cena", modeBrand: "Konkrēts zīmols", modeManual: "Manuāla cena",
  excludeVat: "Degvielas izmaksās neiekļaut PVN (PVN tiek atgūts)",
  costParams: "Izmaksu parametri", "s.driver_hourly_rate": "Vadītāja izmaksas €/h",
  "s.driver_per_diem": "Dienas nauda €/dienā", "s.handling_minutes_per_stop": "Iekraušana/izkraušana, min pieturā",
  "s.max_driving_hours_per_day": "Maks. braukšanas h dienā", "s.break_minutes_per_4_5h": "Pārtraukums min uz 4,5 h",
  "s.wear_eur_per_km": "Nolietojums un apkope €/km", "s.fixed_eur_per_day": "Pastāvīgās izmaksas €/dienā",
  "s.margin_pct": "Uzcenojums %", "s.vat_rate": "PVN likme", "s.fuel_manual_price": "Manuālā dīzeļdegvielas cena €/L",
  unusedSeparately: "Rādīt neizmantoto ietilpību kā atsevišķu izmaksu pozīciju, nevis sadalīt starp pasūtījumiem",
  tollsTitle: "Ceļu nodevas kravas transportlīdzekļiem", colCountry: "Valsts", colType: "Veids",
  perDay: "€ dienā (vinjete)", perKmToll: "€ par km",
  tollsNote: "Noklusējuma vērtības ir aptuvenas N3 kategorijas likmes. Salīdziniet tās ar spēkā esošajiem tarifiem (LV: VSAA vinjete, LT: nodeva par nobraukto attālumu, EE: Transpordiamet ceļu lietošanas maksa).",
  reportIssue: "Ziņot par problēmu", issueKind: "Veids", kindBug: "Kļūda", kindIdea: "Ideja / uzlabojums",
  kindQuestion: "Jautājums", issueTitle: "Virsraksts", issueTitlePh: "Īss apraksts",
  issueDesc: "Kas notika? Ko gaidījāt?", issueDescPh: "Darbības, ko redzējāt, ko gaidījāt…",
  includeContext: "Pievienot tehnisko informāciju (lapa, valoda, pārlūks, ekrāna izmērs)",
  publicWarning: "Ziņojumi GitHub ir publiski: neiekļaujiet klientu nosaukumus, cenas vai personas datus.",
  send: "Nosūtīt", sending: "Sūta…", issueCreated: "Paldies! Izveidots ziņojums #{n}.", viewOnGithub: "Skatīt GitHub",
  notConfiguredFallback: "Tiešā nosūtīšana šajā serverī nav iestatīta. Varat izveidot ziņojumu GitHub (nepieciešams GitHub konts):",
  openOnGithub: "Atvērt GitHub",
};

const DICT: Record<Lang, Record<Key, string>> = { en, lv };

function initialLang(): Lang {
  try {
    const s = localStorage.getItem("lang");
    if (s === "lv" || s === "en") return s;
  } catch {
    /* storage unavailable */
  }
  return "lv";
}

let current: Lang = initialLang();
export const getLang = () => current;
export const numberLocale = () => (current === "lv" ? "lv-LV" : "en-GB");

export type Params = Record<string, string | number>;

export function translate(key: Key, params?: Params): string {
  const text = DICT[current][key] ?? en[key] ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, p) => (p in params ? String(params[p]) : m)) : text;
}

/** Translate backend restriction labels like "max height 3.2 m" / "no HGV". */
export function translateRestriction(s: string): string {
  for (const k of ["max axle load", "max height", "max weight", "max length", "max width", "no HGV"] as const) {
    if (s.startsWith(k)) return translate(`r.${k}`) + s.slice(k.length);
  }
  return s;
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: typeof translate };
const I18nContext = createContext<Ctx>({ lang: current, setLang: () => {}, t: translate });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(current);
  const setLang = (l: Lang) => {
    current = l;
    try {
      localStorage.setItem("lang", l);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = l;
    setLangState(l);
  };
  document.documentElement.lang = lang;
  // a new function identity per language makes consumers re-render with the new strings
  const t = (key: Key, params?: Params) => translate(key, params);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
