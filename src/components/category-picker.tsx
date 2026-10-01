"use client";

import { TEMPERATURE_LABEL } from "@/lib/constants";

const HINT: Record<string, string> = { HOT: "Ready to buy soon", WARM: "Interested, needs follow-up", COLD: "Early or unsure" };
const TONE: Record<string, string> = { HOT: "border-coral text-coral", WARM: "border-sun text-sun", COLD: "border-sky text-sky" };

/** Hot / Warm / Cold as three big buttons (opportunity category). */
export function CategoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Category">
      {(Object.entries(TEMPERATURE_LABEL) as [string, string][]).map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={value === k}
          className={`rounded-lg border-2 px-2 py-2.5 text-center ${value === k ? `${TONE[k]} bg-surf2 font-bold` : "border-line text-ink2"}`}
          onClick={() => onChange(k)}
        >
          <div className="text-[15px]">{label}</div>
          <div className="small faint hidden min-[420px]:block">{HINT[k]}</div>
        </button>
      ))}
    </div>
  );
}
