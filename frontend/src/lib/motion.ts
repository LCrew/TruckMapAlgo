import { flushSync } from "react-dom";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run a state update inside a View Transition when the browser supports it (desktop only,
 *  respects reduced motion). `kind` lands on <html data-vt> so CSS can tune each transition. */
export function withViewTransition(update: () => void, kind = "view") {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  if (!doc.startViewTransition || reduced() || matchMedia("(max-width: 800px)").matches) {
    update();
    return;
  }
  document.documentElement.dataset.vt = kind;
  const t = doc.startViewTransition(() => flushSync(update));
  t.finished.finally(() => delete document.documentElement.dataset.vt);
}

/** Briefly highlight an element (after it was created or changed somewhere else). */
export function flash(el: Element | null, cls = "target", ms = 2600) {
  if (!el || reduced()) return;
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
