"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { STAGES, STAGE_LABEL, TEMPERATURE_LABEL } from "@/lib/constants";
import type { Option } from "@/server/queries";

const CHIPS: [string, string][] = [["All", "All"], ["Open", "Open"], ...STAGES.map((s) => [s, STAGE_LABEL[s]] as [string, string])];

export function OppFilterBar({ team }: { team: Option[] | null }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("opp");
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };

  useEffect(() => {
    if (q === (sp.get("q") ?? "")) return;
    const t = setTimeout(() => set("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const stage = sp.get("stage") || "All";
  const cat = sp.get("cat") ?? "";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <input
        className="in w-full min-[901px]:w-auto min-[901px]:min-w-[240px]"
        placeholder="Search school, contact, city"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search opportunities"
      />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stage">
        {CHIPS.map(([v, l]) => (
          <button key={v} className={`chip ${stage === v ? "on" : ""}`} onClick={() => set("stage", v === "All" ? "" : v)}>
            {l}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
        {([["", "Any category"], ...Object.entries(TEMPERATURE_LABEL)] as [string, string][]).map(([v, l]) => (
          <button key={l} className={`chip ${cat === v ? "on" : ""}`} onClick={() => set("cat", v)}>
            {l}
          </button>
        ))}
      </div>
      {team ? (
        <select className="sel w-auto min-w-[170px]" aria-label="Assigned to" value={sp.get("owner") ?? ""} onChange={(e) => set("owner", e.target.value)}>
          <option value="">All salespeople</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}
