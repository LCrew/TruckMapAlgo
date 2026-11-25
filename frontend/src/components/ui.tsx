/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../lib/i18n";
import Icon, { IconName } from "./Icon";

/* ── Window: centred pop-up dialog (closes on ×, Esc and shade click) ── */
export function Window({ title, onClose, children, actions, width }: {
  title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode; width?: number;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input:not(.hp):not([type=checkbox]), select, textarea");
    (first ?? ref.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <>
      <div className="sheet-shade" onClick={onClose} />
      <div className="window-wrap">
        <div className="window" role="dialog" aria-modal="true" ref={ref} tabIndex={-1} style={width ? { maxWidth: width } : undefined}>
          <div className="window__head">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t("closeLabel")}><Icon name="x" /></button>
          </div>
          {children}
          {actions && <div className="window__actions">{actions}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}

/* ── Toast: one short message at the bottom, optionally with an action ── */
type ToastAction = { label: string; run: () => void };
type ToastFn = (text: string, action?: ToastAction) => void;
const ToastCtx = createContext<ToastFn>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; text: string; action?: ToastAction } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback<ToastFn>((text, action) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text, action });
    timer.current = setTimeout(() => setToast(null), action ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && createPortal(
        <div key={toast.id} className={`toast ${toast.action ? "" : "solo"}`} role="status" aria-live="polite">
          <span>{toast.text}</span>
          {toast.action && <button onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button>}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ── Toggle switch ── */
export function Toggle({ checked, onChange, children, small, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; small?: boolean; disabled?: boolean;
}) {
  return (
    <label className={`toggle ${small ? "sm" : ""}`} style={disabled ? { opacity: .5, cursor: "default" } : undefined}>
      <input type="checkbox" className="vh" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__ui" />
      {children && <span>{children}</span>}
    </label>
  );
}

/* ── Segmented control ── */
export function Seg<T extends string | number>({ value, options, onChange, full, label }: {
  value: T; options: { value: T; label: ReactNode; count?: number }[]; onChange: (v: T) => void; full?: boolean; label?: string;
}) {
  return (
    <div className={`seg ${full ? "full" : ""}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="tab" aria-selected={o.value === value}
          className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="cnt">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ── Two-step delete: first click arms, second click (within 3 s) confirms ── */
export function ConfirmButton({ onConfirm, title, confirmLabel, icon = "trash", label, className = "icon-btn danger" }: {
  onConfirm: () => void; title: string; confirmLabel?: string; icon?: IconName; label?: string; className?: string;
}) {
  const { t } = useI18n();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const tm = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(tm);
  }, [armed]);
  return (
    <button type="button" className={`${className} ${armed ? "armed" : ""}`} title={title} aria-label={armed ? confirmLabel ?? t("confirmDelete") : title}
      onClick={(e) => {
        e.stopPropagation();
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}>
      {armed ? (confirmLabel ?? t("confirmDelete")) : <><Icon name={icon} size={18} />{label && <span>{label}</span>}</>}
    </button>
  );
}

/* ── Labelled field ── */
export function Field({ label, hint, aside, children, className }: {
  label: ReactNode; hint?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <label className={`field ${className ?? ""}`}>
      <span className="field__label"><span>{label}</span>{aside}</span>
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  );
}

/* ── Spinner for busy buttons ── */
export const Spinner = ({ size = 18 }: { size?: number }) => <Icon name="refresh" size={size} className="spin" />;

/* ── File picker button ── */
export function FileButton({ accept, onFile, children, className = "btn" }: {
  accept: string; onFile: (f: File) => void; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()}>{children}</button>
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = "";
      }} />
    </>
  );
}
