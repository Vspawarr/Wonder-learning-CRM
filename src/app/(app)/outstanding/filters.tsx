"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Option } from "@/server/queries";

const SHOW: [string, string][] = [
  ["", "To collect"],
  ["overdue", "Overdue"],
  ["paid", "Paid"],
  ["all", "All"],
];

export function OutstandingFilterBar({ owners }: { owners: Option[] | null }) {
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

  const show = sp.get("show") ?? "";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <input
        className="in w-full min-[901px]:w-auto min-[901px]:min-w-[240px]"
        placeholder="Search school or invoice no."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search invoices"
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {SHOW.map(([v, l]) => (
          <button key={l} className={`chip ${show === v ? "on" : ""}`} onClick={() => set("show", v)}>
            {l}
          </button>
        ))}
      </div>
      {owners ? (
        <select className="sel w-auto" aria-label="Salesperson" value={sp.get("owner") ?? ""} onChange={(e) => set("owner", e.target.value)}>
          <option value="">All salespeople</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
