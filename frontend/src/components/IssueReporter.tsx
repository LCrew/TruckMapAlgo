import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import Icon from "./Icon";
import { Field, Seg, Spinner, Toggle, Window } from "./ui";

type Kind = "bug" | "idea" | "question";

/** "Report an issue" dialog: creates a GitHub issue through the backend (token stays on the server).
 *  If the server has no token configured, offers GitHub's own prefilled "new issue" page instead. */
export default function IssueReporter({ page, onClose }: { page: string; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState<Kind>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [withContext, setWithContext] = useState(true);
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ number: number | null; url: string } | null>(null);
  const [config, setConfig] = useState<{ enabled: boolean; new_issue_url: string } | null>(null);

  useEffect(() => {
    api.issueConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  const context = (): Record<string, string> =>
    withContext
      ? {
          page,
          language: lang,
          browser: navigator.userAgent,
          screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
          time: new Date().toISOString(),
        }
      : {};

  const githubFallbackUrl = () => {
    if (!config) return "#";
    const ctx = Object.entries(context()).map(([k, v]) => `- ${k}: ${v}`).join("\n");
    const prefix = kind === "bug" ? "Bug" : kind === "idea" ? "Idea" : "Question";
    const q = new URLSearchParams({ title: `[${prefix}] ${title}`, body: description + (ctx ? `\n\n${ctx}` : "") });
    return `${config.new_issue_url}?${q}`;
  };

  const valid = title.trim().length >= 3 && description.trim().length >= 10;
  const fallback = !!config && !config.enabled;

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      setCreated(await api.createIssue({ title, description, kind, context: context(), website }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const actions = created ? (
    <button className="btn primary" onClick={onClose}>{t("done")}</button>
  ) : (
    <>
      <button className="btn" onClick={onClose}>{t("cancel")}</button>
      {fallback ? (
        <a className={`btn primary ${valid ? "" : "disabled"}`} href={githubFallbackUrl()} target="_blank" rel="noreferrer"
          aria-disabled={!valid} onClick={(e) => !valid && e.preventDefault()} style={valid ? undefined : { opacity: .45, pointerEvents: "none" }}>
          <Icon name="external" size={18} />{t("openOnGithub")}
        </a>
      ) : (
        <button className="btn primary" disabled={!valid || busy} onClick={submit}>
          {busy ? <Spinner /> : <Icon name="flag" size={18} />}{busy ? t("sending") : t("send")}
        </button>
      )}
    </>
  );

  return (
    <Window title={t("reportIssue")} onClose={onClose} actions={actions} width={560}>
      {created ? (
        <div className="alert ok">
          <Icon name="check" size={18} />
          <span>
            {t("issueCreated", { n: created.number ?? "" })}{" "}
            <a href={created.url} target="_blank" rel="noreferrer">{t("viewOnGithub")}</a>
          </span>
        </div>
      ) : (
        <div className="stack">
          <Seg full value={kind} onChange={setKind} label={t("issueKind")}
            options={[{ value: "bug", label: t("kindBug") }, { value: "idea", label: t("kindIdea") }, { value: "question", label: t("kindQuestion") }]} />
          <Field label={t("issueTitle")}>
            <input value={title} maxLength={120} placeholder={t("issueTitlePh")} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t("issueDesc")}>
            <textarea rows={6} value={description} maxLength={6000} placeholder={t("issueDescPh")} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {/* honeypot: hidden from people, bots tend to fill every field */}
          <input className="hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
          <Toggle small checked={withContext} onChange={setWithContext}><span className="small">{t("includeContext")}</span></Toggle>
          <div className="alert info"><Icon name="info" size={18} /><span className="small">{t("publicWarning")}</span></div>
          {fallback && <p className="small muted" style={{ margin: 0 }}>{t("notConfiguredFallback")}</p>}
          {error && <div className="alert error"><Icon name="alert" size={18} /><span>{error}</span></div>}
        </div>
      )}
    </Window>
  );
}
