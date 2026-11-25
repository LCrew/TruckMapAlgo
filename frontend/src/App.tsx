import { useEffect, useState } from "react";
import Icon, { IconName } from "./components/Icon";
import IssueReporter from "./components/IssueReporter";
import { ToastProvider } from "./components/ui";
import { api, FuelPricing, Settings as SettingsT } from "./lib/api";
import { Key, useI18n } from "./lib/i18n";
import { withViewTransition } from "./lib/motion";
import Fuel from "./pages/Fuel";
import Orders from "./pages/Orders";
import Planner from "./pages/Planner";
import Settings from "./pages/Settings";
import Trucks from "./pages/Trucks";

const TABS: { id: string; icon: IconName }[] = [
  { id: "Planner", icon: "route" },
  { id: "Orders", icon: "box" },
  { id: "Trucks", icon: "truck" },
  { id: "Fuel", icon: "fuel" },
  { id: "Settings", icon: "settings" },
];

const savedTab = () => {
  try {
    const v = localStorage.getItem("tab");
    return TABS.some((x) => x.id === v) ? v! : "Planner";
  } catch {
    return "Planner";
  }
};

export default function App() {
  const { t, lang, setLang } = useI18n();
  const [tab, setTabState] = useState(savedTab);
  const [settings, setSettings] = useState<SettingsT | null>(null);
  const [routerOk, setRouterOk] = useState<boolean | null>(null);
  const [fuel, setFuel] = useState<FuelPricing | null>(null);
  const [reporting, setReporting] = useState(false);

  const setTab = (id: string) => {
    if (id === tab) return;
    withViewTransition(() => setTabState(id), "tab");
    try {
      localStorage.setItem("tab", id);
    } catch {
      /* not remembered */
    }
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    api.settings().then(setSettings).catch(() => {});
    const poll = () => {
      api.health().then((h) => setRouterOk(!!h.valhalla?.ok)).catch(() => setRouterOk(false));
      api.fuelPricing().then(setFuel).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.title = t("appName");
    document.documentElement.lang = lang;
  }, [lang, t]);

  const idx = TABS.findIndex((x) => x.id === tab);

  return (
    <ToastProvider>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6h11v10H2zM13 9h4.5l3.5 3.5V16h-8M6.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM16.5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
            </svg>
          </span>
          <span className="brand-name">{t("appName")}</span>
        </div>

        <nav className="nv" aria-label={t("mainNav")}>
          {TABS.map((x) => (
            <button key={x.id} className={tab === x.id ? "on" : ""} aria-current={tab === x.id ? "page" : undefined} onClick={() => setTab(x.id)}>
              <Icon name={x.icon} size={18} />
              {t(`tab.${x.id}` as Key)}
            </button>
          ))}
        </nav>

        <div className="top-right">
          <div className="top-status">
            <span className={`pill ${routerOk === false ? "bad" : routerOk ? "ok" : ""} hide-phone`}
              title={routerOk === false ? t("routerOfflineHint") : t("routerReady")}>
              <span className="dot" />{routerOk === false ? t("routerOffline") : t("routerShort")}
            </span>
            {fuel && (
              <button className={`pill ${fuel.stale ? "warn" : ""} hide-phone`} style={{ border: 0, cursor: "pointer" }}
                onClick={() => setTab("Fuel")} title={`${t("dieselForPricing")}: ${t(`mode.${fuel.mode}` as Key)}`}>
                <Icon name="fuel" size={14} />€{fuel.price.toFixed(3)}
              </button>
            )}
          </div>
          <div className="seg lang-seg" role="group" aria-label={t("language")}>
            {(["lv", "en"] as const).map((l) => (
              <button key={l} className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
          <button className="rb sm" onClick={() => setReporting(true)} title={t("reportIssue")} aria-label={t("reportIssue")}>
            <Icon name="flag" size={18} />
          </button>
        </div>
      </header>

      <main key={tab} className="vt-main">
        {tab === "Planner" && <Planner settings={settings} goTo={setTab} />}
        {tab === "Orders" && <Orders goTo={setTab} />}
        {tab === "Trucks" && <Trucks />}
        {tab === "Fuel" && <Fuel />}
        {tab === "Settings" && <Settings onSaved={setSettings} />}
      </main>

      <nav className="bnav" aria-label={t("mainNav")}>
        <span className="bnav__pill" style={{ transform: `translateX(${idx * 100}%)` }} />
        {TABS.map((x) => (
          <button key={x.id} className={tab === x.id ? "on" : ""} aria-current={tab === x.id ? "page" : undefined} onClick={() => setTab(x.id)}>
            <Icon name={x.icon} size={20} />
            <span>{t(`tab.${x.id}` as Key)}</span>
          </button>
        ))}
      </nav>

      {reporting && <IssueReporter page={tab} onClose={() => setReporting(false)} />}
    </ToastProvider>
  );
}
