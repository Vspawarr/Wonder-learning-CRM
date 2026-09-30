"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { STATES } from "@/lib/constants";
import { PERIODS } from "@/server/dashboard-periods";
import type { Option } from "@/server/queries";

/** Period for everyone; executive and state filters for managers and above. */
export function DashFilterBar({ team }: { team: Option[] | null }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };
  const period = sp.get("period") ?? "month";
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <select className="sel w-auto min-w-[160px]" aria-label="Period" value={period} onChange={(e) => set({ period: e.target.value === "month" ? "" : e.target.value })}>
        {PERIODS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {period === "custom" ? (
        <>
          <input className="in w-auto" type="date" aria-label="From" value={sp.get("from") ?? ""} onChange={(e) => set({ from: e.target.value })} />
          <span className="muted">to</span>
          <input className="in w-auto" type="date" aria-label="To" value={sp.get("to") ?? ""} onChange={(e) => set({ to: e.target.value })} />
        </>
      ) : null}
      {team ? (
        <>
          <select className="sel w-auto min-w-[170px]" aria-label="Executive" value={sp.get("exec") ?? ""} onChange={(e) => set({ exec: e.target.value })}>
            <option value="">Whole team</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select className="sel w-auto min-w-[150px]" aria-label="State" value={sp.get("state") ?? ""} onChange={(e) => set({ state: e.target.value })}>
            <option value="">All states</option>
            {STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </>
      ) : null}
    </div>
  );
}
