"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SOURCES } from "@/lib/constants";

const STATUS = ["Active", "All", "Converted", "Disqualified"];

export function LeadFilters() {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${path}?${next}`, { scroll: false });
  };

  // Debounced search.
  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const status = sp.get("status") ?? "Active";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <input
        className="in w-auto min-w-[220px]"
        placeholder="Search school, owner, city, mobile"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search leads"
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
        {STATUS.map((s) => (
          <button key={s} className={`chip ${status === s ? "on" : ""}`} onClick={() => set("status", s === "Active" ? "" : s)}>
            {s}
          </button>
        ))}
      </div>
      <select className="sel w-auto min-w-[150px]" aria-label="Source" value={sp.get("src") ?? ""} onChange={(e) => set("src", e.target.value)}>
        <option value="">All sources</option>
        {SOURCES.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
