"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const STATUS: [string, string][] = [
  ["", "All"],
  ["ONBOARDING", "Onboarding"],
  ["ACTIVE", "Active"],
];

// The chosen financial year: which schools ordered, renewed or didn't continue (R31).
const YEAR: [string, string][] = [
  ["", "All"],
  ["ordered", "Ordered"],
  ["renewed", "Renewed"],
  ["new", "New"],
  ["notrenewed", "Not renewed"],
  ["none", "No order"],
];

export function ClientFilterBar({ year }: { year: string | null }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };

  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const status = sp.get("status") ?? "";
  const yr = sp.get("yr") ?? "";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <input
        className="in w-full min-[901px]:w-auto min-[901px]:min-w-[240px]"
        placeholder="Search school, contact, city, mobile"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search clients"
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
        {STATUS.map(([v, l]) => (
          <button key={l} className={`chip ${status === v ? "on" : ""}`} onClick={() => set("status", v)}>
            {l}
          </button>
        ))}
      </div>
      {year ? (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`In ${year}`}>
          <span className="small muted mr-0.5">In {year}:</span>
          {YEAR.map(([v, l]) => (
            <button key={l} className={`chip ${yr === v ? "on" : ""}`} onClick={() => set("yr", v)}>
              {l}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
