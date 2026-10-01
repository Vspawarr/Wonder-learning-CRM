"use client";

import { useAction } from "@/components/client";
import { setFeature } from "@/app/actions";
import { FEATURES, type FeatureKey, type Features } from "@/lib/features";

export function FeatureSwitches({ features }: { features: Features }) {
  const { pending, run } = useAction();
  return (
    <div className="card">
      {(Object.keys(FEATURES) as FeatureKey[]).map((k) => (
        <label key={k} className="flex cursor-pointer items-start justify-between gap-4 border-b border-line py-3 last:border-0">
          <span className="min-w-0">
            <b>{FEATURES[k].label}</b>
            <span className="small muted block">{FEATURES[k].hint}</span>
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap">
            <span className={`small ${features[k] ? "text-mint" : "faint"}`}>{features[k] ? "On" : "Off"}</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              aria-label={FEATURES[k].label}
              checked={features[k]}
              disabled={pending}
              onChange={(e) => run(() => setFeature(k, e.target.checked), { success: `${FEATURES[k].label}: ${e.target.checked ? "on" : "off"}.` })}
            />
          </span>
        </label>
      ))}
    </div>
  );
}
