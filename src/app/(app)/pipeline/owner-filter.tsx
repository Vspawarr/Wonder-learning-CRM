"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Option } from "@/server/queries";

export function OwnerFilter({ team, value }: { team: Option[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  return (
    <select
      className="sel w-auto min-w-[170px]"
      aria-label="Assigned to"
      value={value}
      onChange={(e) => {
        const next = new URLSearchParams(sp);
        if (e.target.value) next.set("owner", e.target.value);
        else next.delete("owner");
        next.delete("opp");
        router.replace(`${path}?${next}`, { scroll: false });
      }}
    >
      <option value="">All salespeople</option>
      {team.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}
