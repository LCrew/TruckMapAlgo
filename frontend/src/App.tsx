import { useEffect, useState } from "react";
import IssueReporter from "./components/IssueReporter";
import { api, FuelPricing, Settings as S } from "./lib/api";
import { Lang, useI18n } from "./lib/i18n";
import Fuel from "./pages/Fuel";
import Orders from "./pages/Orders";
import Planner from "./pages/Planner";
import Settings from "./pages/Settings";
import Trucks from "./pages/Trucks";

const TABS = ["Planner", "Orders", "Trucks", "Fuel", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = localStorage.getItem("tab") as Tab;
      return TABS.includes(saved) ? saved : "Planner";
    } catch {
      return "Planner";
    }
  });
  const [settings, setSettings] = useState<S | null>(null);
  const [routerOk, setRouterOk] = useState<boolean | null>(null);
  const [fuel, setFuel] = useState<FuelPricing | null>(null);
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    api.settings().then(setSettings);
    const poll = () => {
      api.health().then((h) => setRouterOk(h.valhalla.ok)).catch(() => setRouterOk(false));
      api.fuelPricing().then(setFuel).catch(() => {});
    };
    poll();
    const timer = setInterval(poll, 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = t("appName");
  }, [t]);

  const go = (x: Tab) => {
    setTab(x);
    try {
      localStorage.setItem("tab", x);
    } catch {
      /* storage unavailable */
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">LV</span>{t("appName")}</div>
        <nav className="tabs">
          {TABS.map((x) => <button key={x} className={x === tab ? "active" : ""} onClick={() => go(x)}>{t(`tab.${x}`)}</button>)}
        </nav>
        <div className="status">
          <span><i className={`dot ${routerOk == null ? "" : routerOk ? "ok" : "bad"}`} />{routerOk === false ? t("routerOffline") : t("routerReady")}</span>
          {fuel && <span><i className={`dot ${fuel.stale ? "bad" : "ok"}`} />DD €{fuel.price.toFixed(3)}</span>}
        </div>
        <div className="top-actions">
          <button className="btn topbar-btn" onClick={() => setReporting(true)} title={t("reportIssue")}>
            <span aria-hidden="true">⚑</span> <span className="label">{t("reportIssue")}</span>
          </button>
          <div className="lang-switch" role="group" aria-label="Language">
            {(["lv", "en"] as Lang[]).map((l) => (
              <button key={l} className={l === lang ? "active" : ""} aria-pressed={l === lang} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>
      {tab === "Planner" && <Planner settings={settings} />}
      {tab === "Orders" && <Orders />}
      {tab === "Trucks" && <Trucks />}
      {tab === "Fuel" && <Fuel />}
      {tab === "Settings" && <Settings onSaved={setSettings} />}
      {reporting && <IssueReporter page={tab} onClose={() => setReporting(false)} />}
    </div>
  );
}
