"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const STATUS: [string, string][] = [
  ["", "All"],
  ["ONBOARDING", "Onboarding"],
  ["ACTIVE", "Active"],
];

export function ClientFilterBar() {
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
    </div>
  );
}
