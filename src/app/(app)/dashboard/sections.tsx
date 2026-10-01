"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DASH_SECTIONS, type DashSection } from "./sections-list";

/** "All" plus one button per area; pick one or several. The choice is remembered on this device. */
export function SectionPicker({ shown }: { shown: DashSection[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const everything = shown.length === DASH_SECTIONS.length;
  const apply = (next: DashSection[]) => {
    const all = !next.length || next.length === DASH_SECTIONS.length;
    const value = all ? "" : DASH_SECTIONS.filter(([k]) => next.includes(k)).map(([k]) => k).join(",");
    document.cookie = `dash_sections=${value || "all"}; path=/; max-age=31536000; samesite=lax`;
    const q = new URLSearchParams(sp);
    q.set("show", value || "all");
    router.replace(`${path}?${q}`, { scroll: false });
  };
  return (
    <div className="dsec" role="group" aria-label="Show sections">
      <button className={`dchip ${everything ? "on" : ""}`} aria-pressed={everything} onClick={() => apply([])}>
        All
      </button>
      {DASH_SECTIONS.map(([k, label, color]) => {
        const on = !everything && shown.includes(k);
        return (
          <button
            key={k}
            className={`dchip ${on ? "on" : ""}`}
            style={{ "--c": color } as React.CSSProperties}
            aria-pressed={on}
            onClick={() => apply(everything ? [k] : on ? shown.filter((s) => s !== k) : [...shown, k])}
          >
            <i aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
