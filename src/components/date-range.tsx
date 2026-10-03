"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DateInput } from "./date-input";
import { Icon } from "./icons";

/** Custom date filter: "From ⟨date⟩ to ⟨date⟩" in the address (?from=&to=), so lists and exports follow it. */
export function DateRangeFilter({ label }: { label: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };
  return (
    <div className="daterange" role="group" aria-label={`${label} between`}>
      <span className="small strong muted whitespace-nowrap">{label}</span>
      <DateInput className="w-[140px]" ariaLabel={`${label} from`} value={from} onChange={(v) => set({ from: v })} />
      <span className="small muted">to</span>
      <DateInput className="w-[140px]" ariaLabel={`${label} to`} value={to} onChange={(v) => set({ to: v })} />
      {from || to ? (
        <button className="btn ghost sm" onClick={() => set({ from: "", to: "" })} aria-label="Clear dates">
          <Icon name="x" size={14} /> Clear
        </button>
      ) : null}
    </div>
  );
}
