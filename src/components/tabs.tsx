"use client";

import { useSearchParams } from "next/navigation";

export type TabDef = { id: string; label: string; count?: number; panel: React.ReactNode };

/**
 * Prototype-style tabs. Every panel stays mounted (open pop-ups and typing survive a
 * switch); the chosen tab is kept in the address as ?tab=… so links and Back work.
 */
export function Tabs({ tabs, param = "tab" }: { tabs: TabDef[]; param?: string }) {
  const sp = useSearchParams();
  const want = sp.get(param);
  const current = tabs.some((t) => t.id === want) ? want! : tabs[0]?.id;
  const pick = (id: string) => {
    const next = new URLSearchParams(sp);
    if (id === tabs[0]?.id) next.delete(param);
    else next.set(param, id);
    window.history.replaceState(null, "", next.size ? `?${next}` : window.location.pathname);
  };
  return (
    <div>
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === current}
            aria-controls={`panel-${t.id}`}
            className={t.id === current ? "on" : ""}
            onClick={() => pick(t.id)}
          >
            {t.label}
            {t.count ? <span className="tc">{t.count}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} hidden={t.id !== current}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}
