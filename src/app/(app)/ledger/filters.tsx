"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DateInput } from "@/components/date-input";
import type { Option } from "@/server/queries";

const PERIODS: [string, string][] = [
  ["", "This financial year"],
  ["lastfy", "Last financial year"],
  ["month", "This month"],
  ["custom", "Custom dates"],
];

export function LedgerFilters({ clients, owners }: { clients: { id: string; schoolName: string; city: string }[]; owners: Option[] | null }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };
  const period = sp.get("period") ?? "";
  const client = sp.get("client") ?? "";
  return (
    <div className="mb-3 flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <select className="sel w-full min-[701px]:w-auto min-[701px]:min-w-[280px]" aria-label="Client" value={client} onChange={(e) => set({ client: e.target.value })}>
          <option value="">All clients (summary)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.schoolName} · {c.city}
            </option>
          ))}
        </select>
        {owners && !client ? (
          <select className="sel w-auto" aria-label="Salesperson" value={sp.get("owner") ?? ""} onChange={(e) => set({ owner: e.target.value })}>
            <option value="">All salespeople</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Period">
        {PERIODS.map(([v, l]) => (
          <button key={l} className={`chip ${period === v ? "on" : ""}`} onClick={() => set({ period: v, ...(v === "custom" ? {} : { from: "", to: "" }) })}>
            {l}
          </button>
        ))}
      </div>
      {period === "custom" ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="small">
            From
            <DateInput id="lg-from" value={from} onChange={setFrom} />
          </label>
          <label className="small">
            To
            <DateInput id="lg-to" value={to} onChange={setTo} />
          </label>
          <button className="btn" disabled={!from || !to} onClick={() => set({ from, to })}>
            Show
          </button>
        </div>
      ) : null}
    </div>
  );
}
