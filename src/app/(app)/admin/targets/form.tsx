"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "@/components/client";
import { saveTargets } from "@/app/actions";
import { inr } from "@/lib/format";

type Row = {
  userId: string;
  name: string;
  salesTarget: number;
  collectionTarget: number;
  sales: number;
  collection: number;
};

const label = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const shift = (m: string, n: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export function TargetsForm({ month, rows }: { month: string; rows: Row[] }) {
  const router = useRouter();
  const path = usePathname();
  const [v, setV] = useState(
    rows.map((r) => ({
      userId: r.userId,
      sales: r.salesTarget ? String(r.salesTarget) : "",
      collection: r.collectionTarget ? String(r.collectionTarget) : "",
    })),
  );
  const { pending, run } = useAction();
  const set = (i: number, k: "sales" | "collection", val: string) => setV(v.map((x, j) => (j === i ? { ...x, [k]: val } : x)));
  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button className="btn sm" onClick={() => router.replace(`${path}?month=${shift(month, -1)}`)} aria-label="Previous month">
          ←
        </button>
        <b className="min-w-[140px] text-center">{label(month)}</b>
        <button className="btn sm" onClick={() => router.replace(`${path}?month=${shift(month, 1)}`)} aria-label="Next month">
          →
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <div
            key={r.userId}
            className="grid grid-cols-1 gap-2 border-b border-line pb-3 last:border-0 min-[701px]:grid-cols-[minmax(0,1fr)_200px_200px] min-[701px]:items-end"
          >
            <b>{r.name}</b>
            <label className="small">
              Sales target (₹) <span className="faint">· done {inr(r.sales)}</span>
              <input
                className="in mt-1"
                inputMode="numeric"
                value={v[i].sales}
                onChange={(e) => set(i, "sales", e.target.value)}
                aria-label={`Sales target for ${r.name}`}
              />
            </label>
            <label className="small">
              Collection target (₹) <span className="faint">· done {inr(r.collection)}</span>
              <input
                className="in mt-1"
                inputMode="numeric"
                value={v[i].collection}
                onChange={(e) => set(i, "collection", e.target.value)}
                aria-label={`Collection target for ${r.name}`}
              />
            </label>
          </div>
        ))}
      </div>
      <button
        className="btn pri mt-3"
        disabled={pending}
        onClick={() =>
          run(() => saveTargets(month, v), {
            success: `Targets saved for ${label(month)}.`,
          })
        }
      >
        {pending ? "Saving…" : "Save targets"}
      </button>
    </div>
  );
}
