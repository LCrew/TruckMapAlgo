import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";

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
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

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

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="issue-title" onMouseDown={(e) => e.stopPropagation()}>
        <div className="spread">
          <h2 id="issue-title">{t("reportIssue")}</h2>
          <button className="btn ghost" onClick={onClose}>{t("close")}</button>
        </div>

        {created ? (
          <div className="alert">
            {created.number ? t("issueCreated", { n: created.number }) : t("issueCreated", { n: "" })}{" "}
            <a href={created.url} target="_blank" rel="noreferrer">{t("viewOnGithub")}</a>
          </div>
        ) : (
          <>
            <label className="field">{t("issueKind")}
              <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                <option value="bug">{t("kindBug")}</option>
                <option value="idea">{t("kindIdea")}</option>
                <option value="question">{t("kindQuestion")}</option>
              </select>
            </label>
            <label className="field">{t("issueTitle")}
              <input value={title} maxLength={120} placeholder={t("issueTitlePh")} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </label>
            <label className="field">{t("issueDesc")}
              <textarea rows={6} value={description} maxLength={6000} placeholder={t("issueDescPh")}
                onChange={(e) => setDescription(e.target.value)} />
            </label>
            {/* honeypot: hidden from people, bots tend to fill every field */}
            <input className="hp" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} aria-hidden="true" />
            <label className="row small"><input type="checkbox" checked={withContext} onChange={(e) => setWithContext(e.target.checked)} /> {t("includeContext")}</label>
            <div className="alert small">{t("publicWarning")}</div>
            {error && <div className="alert error small">{error}</div>}
            {config && !config.enabled ? (
              <div className="small">
                {t("notConfiguredFallback")}{" "}
                <a className="btn primary" href={githubFallbackUrl()} target="_blank" rel="noreferrer"
                  aria-disabled={!valid} onClick={(e) => !valid && e.preventDefault()}>{t("openOnGithub")}</a>
              </div>
            ) : (
              <div className="row">
                <button className="btn primary" disabled={!valid || busy} onClick={submit}>{busy ? t("sending") : t("send")}</button>
                <button className="btn" onClick={onClose}>{t("cancel")}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
