import Link from "next/link";
import { ExportButtons } from "@/components/export-buttons";
import { Empty, PageHeader, Pill } from "@/components/ui";
import { seesAllSales } from "@/lib/permissions";
import { requireUser } from "@/server/session";
import { TRACK_FILTERS, TRACK_STAGE_LABEL, orderTracker, type TrackStage } from "@/server/tracker";

export const metadata = { title: "Order tracker" };

const STAGE_TONE: Record<TrackStage, "warn" | "info" | "grape" | "bad" | "ok" | "mute"> = {
  SO: "warn",
  PRODUCTION: "grape",
  DISPATCH: "info",
  TRANSIT: "info",
  INVOICE: "warn",
  PAYMENT: "bad",
  DONE: "ok",
  CANCELLED: "mute",
};

// R56: every order from the received PO to the last payment: PO → Sales order → Production → Dispatch → Invoice → Payment.
export default async function TrackerPage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { rows, counts } = await orderTracker(user, sp);
  const show = sp.show && TRACK_FILTERS[sp.show] ? sp.show : "";
  const href = (k: string) => `/tracker?${new URLSearchParams({ ...(k ? { show: k } : {}), ...(sp.q ? { q: sp.q } : {}) })}`;
  return (
    <>
      <PageHeader
        title="Order tracker"
        sub={`Every order from the school's PO to the last payment, in one place. Most urgent first.${seesAllSales(user.role) ? "" : " Your schools only."}`}
      >
        <ExportButtons report="tracker" />
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <form action="/tracker" className="w-full min-[901px]:w-auto">
          {show ? <input type="hidden" name="show" value={show} /> : null}
          <input className="in min-[901px]:min-w-[240px]" name="q" defaultValue={sp.q ?? ""} placeholder="Search school, PO, SO, invoice" aria-label="Search orders" />
        </form>
        <div className="chips" role="group" aria-label="Show">
          {Object.entries(TRACK_FILTERS).map(([k, v]) => (
            <Link key={k} href={href(k)} className={`chip ${show === k ? "on" : ""}`} scroll={false}>
              {v.label} · {counts[k] ?? 0}
            </Link>
          ))}
        </div>
      </div>
      {rows.length ? (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.key} className="card trk">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {r.href ? (
                      <Link href={r.href} className="text-[16px] font-bold">
                        {r.client.schoolName}
                      </Link>
                    ) : (
                      <b className="text-[16px]">{r.client.schoolName}</b>
                    )}
                    <Pill tone={STAGE_TONE[r.stage]}>{TRACK_STAGE_LABEL[r.stage]}</Pill>
                    {r.lateDays && r.stage !== "SO" ? <Pill tone="bad">{`${r.lateDays} ${r.lateLabel}`}</Pill> : null}
                    {r.stage === "SO" && r.lateDays ? <Pill tone="warn">{`${r.lateDays} ${r.lateLabel}`}</Pill> : null}
                  </div>
                  <div className="small muted">
                    {r.ref}
                    {r.client.city ? ` · ${r.client.city}` : ""}
                    {r.salesperson ? ` · ${r.salesperson}` : ""}
                  </div>
                </div>
                {r.stage !== "DONE" && r.stage !== "CANCELLED" ? (
                  <div className="trk-next small">
                    <b>Next:</b> {r.next}
                  </div>
                ) : null}
              </div>
              <ol className="trk-steps">
                {r.steps.map((s) => (
                  <li key={s.title} className={`trk-step ${s.state}`}>
                    <span className="trk-dot" aria-hidden>
                      {s.state === "done" ? "✓" : ""}
                    </span>
                    <b>{s.title}</b>
                    {s.lines.map((l, i) => (
                      <span key={i} className="small block">
                        {l}
                      </span>
                    ))}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty>{sp.q || show ? "No orders match." : "No open orders. Orders appear here once a school's PO is received."}</Empty>
        </div>
      )}
    </>
  );
}
