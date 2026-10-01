"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "./icons";
import type { ActionResult } from "@/app/actions";

/* ---------- toasts ---------- */

type Toast = { id: number; text: string; bad?: boolean };
const ToastCtx = createContext<(text: string, bad?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, bad?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, bad }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), bad ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        className="fixed right-4 bottom-[calc(16px+env(safe-area-inset-bottom,0px))] z-[200] flex max-w-[min(380px,92vw)] flex-col gap-2"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.bad ? "bad" : ""}`} role={t.bad ? "alert" : "status"}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Runs a server action, toasting the error or the success message. */
export function useAction() {
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = useCallback(
    <T,>(fn: () => Promise<ActionResult<T>>, opts: { success?: string; onDone?: (data: T | undefined) => void } = {}) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) {
          toast(r.error, true);
          return;
        }
        if (opts.success) toast(opts.success);
        opts.onDone?.(r.data);
      }),
    [toast],
  );
  return { pending, run };
}

/* ---------- modal / drawer ---------- */

export function Modal({
  title,
  sub,
  onClose,
  children,
  footer,
  wide,
  drawer,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
  drawer?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const downOnScrim = useRef(false);
  // Callers pass a fresh onClose on every render (i.e. every keystroke), so keep
  // it in a ref: the mount effect below must run once, or it would re-focus the
  // first field and scroll the modal back to the top on each change.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    document.addEventListener("keydown", onKey);
    // Phones: don't jump into the first field, or the keyboard pops up and hides the buttons.
    if (!matchMedia("(pointer: coarse)").matches) {
      const first = ref.current?.querySelector<HTMLElement>("input:not([type=hidden]),select,textarea");
      first?.focus({ preventScroll: true });
    }
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div
      className={`scrim ${drawer ? "dr" : ""}`}
      // Close only on a tap that starts and ends on the dark area, so closing the
      // phone keyboard or a drag that ends outside the box doesn't lose the form.
      onPointerDown={(e) => (downOnScrim.current = e.target === e.currentTarget)}
      onClick={(e) => downOnScrim.current && e.target === e.currentTarget && onClose()}
    >
      <div ref={ref} className={drawer ? "drawer" : `modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true">
        <div className="mh">
          <div className="min-w-0">
            {typeof title === "string" ? <h2 className="text-xl">{title}</h2> : title}
            {sub ? <div className="muted mt-1">{sub}</div> : null}
          </div>
          <button className="btn ghost sm" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="mb2">{children}</div>
        {footer ? <div className="mf">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- form field ---------- */

export function Field({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="fld">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

export function Options({ list, blank }: { list: readonly (string | readonly [string, string])[]; blank?: string }) {
  return (
    <>
      {blank !== undefined ? <option value="">{blank}</option> : null}
      {list.map((o) => {
        const [v, l] = typeof o === "string" ? [o, o] : o;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </>
  );
}
