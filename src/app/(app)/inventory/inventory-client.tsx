"use client";

// R54: the Inventory screen: production orders (start → ready), stock of every kit and item (adjust, reorder
// levels, damaged stock) and the movements list. Filters live in the address so exports match the screen.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Empty, Pill, Table } from "@/components/ui";
import { adjustStock, setProductionStatus, setReorderLevel } from "@/app/actions";
import { todayIST } from "@/lib/dates";
import { dmy } from "@/lib/format";
import type { productionOrders, stockLevels, stockMoves } from "@/server/inventory";

type Level = Awaited<ReturnType<typeof stockLevels>>[number];
type Order = Awaited<ReturnType<typeof productionOrders>>[number];
type Move = Awaited<ReturnType<typeof stockMoves>>[number];

const STATUS: Record<Order["status"], [string, "info" | "warn" | "ok" | "mute"]> = {
  PLANNED: ["To start", "warn"],
  IN_PRODUCTION: ["In production", "info"],
  READY: ["Ready", "ok"],
  CANCELLED: ["Cancelled", "mute"],
};

function useParam(key: string) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(key, v);
    else next.delete(key);
    router.replace(`${path}?${next}`, { scroll: false });
  };
  return [sp.get(key) ?? "", set] as const;
}

/* ---------- production orders ---------- */

export function ProductionTab({ orders, manage }: { orders: Order[]; manage: boolean }) {
  const [show, setShow] = useParam("pshow");
  const [open, setOpen] = useState<string | null>(null);
  const { pending, run } = useAction();
  const act = (o: Order, to: "IN_PRODUCTION" | "READY" | "CANCELLED" | "UNDO_READY", msg: string, ask?: string) =>
    (!ask || confirm(ask)) && run(() => setProductionStatus(o.id, to), { success: msg });
  return (
    <>
      <div className="chips mb-3" role="group" aria-label="Show">
        {[
          ["", "Open"],
          ["done", "Ready / cancelled"],
          ["all", "All"],
        ].map(([v, l]) => (
          <button key={l} className={`chip ${show === v ? "on" : ""}`} onClick={() => setShow(v)}>
            {l}
          </button>
        ))}
      </div>
      {orders.length ? (
        <div className="flex flex-col gap-2.5">
          {orders.map((o) => (
            <div key={o.id} className="card p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{o.number}</b>
                    <Pill tone={STATUS[o.status][1]}>{STATUS[o.status][0]}</Pill>
                    {o.short ? <Pill tone="bad">{`${o.short} item(s) short`}</Pill> : null}
                  </div>
                  <div className="mt-0.5">
                    <Link href={`/clients/${o.client.id}?tab=sales`} className="font-semibold">
                      {o.client.schoolName}
                    </Link>
                    <span className="muted"> · {o.client.city}</span>
                  </div>
                  <div className="small muted">
                    {o.salesOrder.number}
                    {o.salesOrder.poNumber ? ` · PO ${o.salesOrder.poNumber}` : ""}
                    {o.dueDate ? ` · deliver by ${dmy(o.dueDate)}` : ""}
                    {o.readyAt ? ` · ready ${dmy(o.readyAt.slice(0, 10))}` : ""}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {o.lines.map((l, i) => (
                      <span key={i} className="tag">
                        {l.qty} × {l.description}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button className="btn sm ghost" onClick={() => setOpen(open === o.id ? null : o.id)} aria-expanded={open === o.id}>
                    {open === o.id ? "Hide items" : "Items needed"}
                  </button>
                  {manage && o.status === "PLANNED" ? (
                    <button className="btn sm" disabled={pending} onClick={() => act(o, "IN_PRODUCTION", "Marked in production.")}>
                      Start production
                    </button>
                  ) : null}
                  {manage && (o.status === "PLANNED" || o.status === "IN_PRODUCTION") ? (
                    <>
                      <button
                        className="btn sm pri"
                        disabled={pending}
                        onClick={() =>
                          act(
                            o,
                            "READY",
                            "Ready: kits added to stock, items taken out.",
                            `Mark ${o.number} ready? ${o.kits} kits go into stock and their items come out of stock.${o.short ? `\n\n${o.short} item(s) are short in the CRM's stock, so their stock will go below zero. Enter the opening stock or stock received first if it's really there.` : ""}`,
                          )
                        }
                      >
                        Mark ready
                      </button>
                      <button className="btn sm ghost" disabled={pending} onClick={() => act(o, "CANCELLED", "Cancelled.", `Cancel ${o.number}?`)}>
                        Cancel
                      </button>
                    </>
                  ) : null}
                  {manage && o.status === "READY" ? (
                    <button
                      className="btn sm ghost"
                      disabled={pending}
                      onClick={() => act(o, "UNDO_READY", "Back in production; stock put back.", `Undo "ready" for ${o.number}? Its kits come out of stock and the items go back. Only if it was marked by mistake.`)}
                    >
                      Undo ready
                    </button>
                  ) : null}
                </div>
              </div>
              {open === o.id ? (
                <div className="mt-3 border-t border-line pt-2">
                  <div className="small muted mb-1.5">Items for all {o.kits} kits, against the good stock today:</div>
                  <div className="grid grid-cols-1 gap-x-6 min-[701px]:grid-cols-2">
                    {o.items.map((i) => (
                      <div key={i.name} className="flex items-center justify-between gap-2 border-b border-line py-1 text-[13px]">
                        <span className="min-w-0 truncate">{i.name}</span>
                        <span className={`whitespace-nowrap ${o.status !== "READY" && o.status !== "CANCELLED" && i.qty > i.inStock ? "font-bold text-coral" : ""}`}>
                          {i.qty} needed · {i.inStock} in stock
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty>{show ? "Nothing here." : "No open production orders. They are made by themselves when a sales order is created from a received PO."}</Empty>
        </div>
      )}
    </>
  );
}

/* ---------- stock ---------- */

const STATE_PILL: Record<Level["state"], [string, "bad" | "warn" | "ok"] | null> = { SHORT: ["Short", "bad"], LOW: ["Low", "warn"], OK: null };

export function StockTab({ levels, manage }: { levels: Level[]; manage: boolean }) {
  const [show, setShow] = useParam("show");
  const [q, setQ] = useState("");
  const [adjusting, setAdjusting] = useState<Level | null>(null);
  const shown = levels.filter(
    (l) =>
      (show === "kits" ? l.kind === "KIT" : show === "items" ? l.kind === "ITEM" : show === "alert" ? l.state !== "OK" : show === "damaged" ? l.damaged > 0 : true) &&
      (!q || l.name.toLowerCase().includes(q.toLowerCase())),
  );
  const pill = (l: Level) => {
    const p = STATE_PILL[l.state];
    return p ? <Pill tone={p[1]}>{p[0]}</Pill> : null;
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <input className="in w-full min-[901px]:w-auto min-[901px]:min-w-[220px]" placeholder="Search item" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search item" />
        <div className="chips" role="group" aria-label="Show">
          {[
            ["", "All"],
            ["kits", "Finished kits"],
            ["items", "Items"],
            ["alert", "Short / low"],
            ["damaged", "Damaged"],
          ].map(([v, l]) => (
            <button key={l} className={`chip ${show === v ? "on" : ""}`} onClick={() => setShow(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="small muted mb-2">
        <b>Free</b> = kits: in stock + in production − still to dispatch; items: in stock − needed by open production orders − still to dispatch.
      </p>
      <div className="hidden min-[901px]:block">
        <Table
          head={["Item", "Type", ["In stock", "num"], ["Damaged", "num"], ["In production", "num"], ["Needed", "num"], ["To dispatch", "num"], ["Free", "num"], ["Reorder at", "num"], "", ""]}
          empty="Nothing to show."
        >
          {shown.map((l) => (
            <tr key={l.id}>
              <td className="font-semibold">{l.name}</td>
              <td className="small muted">{l.kind === "KIT" ? "Kit" : l.sold ? "Item (sold)" : "Item"}</td>
              <td className="num">{l.good}</td>
              <td className="num">{l.damaged || ""}</td>
              <td className="num">{l.kind === "KIT" ? l.inProduction || "" : ""}</td>
              <td className="num">{l.kind === "ITEM" ? l.needed || "" : ""}</td>
              <td className="num">{l.toDispatch || ""}</td>
              <td className={`num font-bold ${l.free < 0 ? "text-coral" : ""}`}>{l.free}</td>
              <td className="num">{l.reorderLevel ?? ""}</td>
              <td>{pill(l)}</td>
              <td className="text-right">
                {manage ? (
                  <button className="btn sm" onClick={() => setAdjusting(l)}>
                    Adjust
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="flex flex-col gap-2 min-[901px]:hidden">
        {shown.map((l) => (
          <div key={l.id} className="card p-3">
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0">{l.name}</b>
              {pill(l)}
            </div>
            <div className="small mt-1 grid grid-cols-3 gap-1">
              <span>
                In stock <b>{l.good}</b>
              </span>
              <span className={l.free < 0 ? "font-bold text-coral" : ""}>
                Free <b>{l.free}</b>
              </span>
              <span>{l.damaged ? `Damaged ${l.damaged}` : ""}</span>
              {l.kind === "KIT" && l.inProduction ? <span>Making {l.inProduction}</span> : null}
              {l.kind === "ITEM" && l.needed ? <span>Needed {l.needed}</span> : null}
              {l.toDispatch ? <span>To send {l.toDispatch}</span> : null}
            </div>
            {manage ? (
              <button className="btn sm mt-2" onClick={() => setAdjusting(l)}>
                Adjust
              </button>
            ) : null}
          </div>
        ))}
        {!shown.length ? (
          <div className="card">
            <Empty>Nothing to show.</Empty>
          </div>
        ) : null}
      </div>
      {adjusting ? <AdjustModal item={adjusting} onClose={() => setAdjusting(null)} /> : null}
    </>
  );
}

const ADJUST_KINDS = [
  ["OPENING", "Opening stock", "What is in the store when you start using the CRM."],
  ["ADD", "Add", "More came in (e.g. a stock count found more)."],
  ["REMOVE", "Remove", "Less than recorded (e.g. lost, used elsewhere); write why."],
  ["TO_DAMAGED", "Set aside as damaged", "Good stock found damaged; moves to damaged stock."],
  ["REPAIRED", "Damaged → good", "Damaged stock repaired or found usable."],
  ["WRITE_OFF", "Write off damaged", "Damaged stock thrown away or sent back to the supplier."],
] as const;

function AdjustModal({ item, onClose }: { item: Level; onClose: () => void }) {
  const [v, setV] = useState({ kind: "OPENING", qty: "", date: todayIST(), note: "" });
  const [reorder, setReorder] = useState(item.reorderLevel === null ? "" : String(item.reorderLevel));
  const { pending, run } = useAction();
  const save = () =>
    run(
      async () => {
        const r = v.qty ? await adjustStock({ ...v, stockItemId: item.id }) : { ok: true as const, data: undefined };
        if (!r.ok) return r;
        const want = reorder.trim() === "" ? null : Number(reorder);
        return want === item.reorderLevel ? r : setReorderLevel(item.id, want);
      },
      { success: "Saved.", onDone: onClose },
    );
  return (
    <Modal
      title={`Stock · ${item.name}`}
      sub={`In stock ${item.good}${item.damaged ? ` · damaged ${item.damaged}` : ""} · free ${item.free}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="fld">
        <label>What</label>
        <div className="flex flex-col gap-1.5">
          {ADJUST_KINDS.map(([k, l, hint]) => (
            <label key={k} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 ${v.kind === k ? "border-brand bg-brandsoft" : "border-line"}`}>
              <input type="radio" name="adj-kind" className="mt-1" checked={v.kind === k} onChange={() => setV({ ...v, kind: k })} />
              <span>
                <b>{l}</b>
                <span className="small muted block">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="How many" htmlFor="adj-qty">
          <input className="in text-right" id="adj-qty" inputMode="numeric" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} />
        </Field>
        <Field label="Date" htmlFor="adj-date">
          <DateInput id="adj-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
        </Field>
      </div>
      <Field label={v.kind === "REMOVE" ? "Why *" : "Note"} htmlFor="adj-note">
        <input className="in" id="adj-note" placeholder="Optional" value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </Field>
      <Field label="Warn when stock falls to (reorder level)" htmlFor="adj-reorder">
        <input className="in text-right" id="adj-reorder" inputMode="numeric" placeholder="No warning" value={reorder} onChange={(e) => setReorder(e.target.value)} />
      </Field>
    </Modal>
  );
}

/* ---------- movements ---------- */

export function MovesTab({ moves, items }: { moves: Move[]; items: { id: string; name: string }[] }) {
  const [item, setItem] = useParam("item");
  const [kind, setKind] = useParam("kind");
  return (
    <>
      <div className="mb-3 grid grid-cols-1 gap-2.5 min-[601px]:grid-cols-2 min-[901px]:flex">
        <select className="sel min-[901px]:w-auto" value={item} onChange={(e) => setItem(e.target.value)} aria-label="Item">
          <option value="">All items</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <select className="sel min-[901px]:w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
          <option value="">Every kind</option>
          {Object.entries({ OPENING: "Opening stock", ADJUST: "Adjustment", PRODUCED: "Produced", USED: "Used in production", DISPATCHED: "Dispatched", RETURNED: "Returned (good)", DAMAGED: "Damaged", WRITE_OFF: "Damaged written off", REPAIRED: "Damaged → good" }).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {moves.length ? (
        <div className="flex flex-col">
          {moves.map((m) => (
            <div key={m.id} className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-0">
              <div className="min-w-0">
                <div className="font-semibold">{m.item}</div>
                <div className="small muted">
                  {dmy(m.date)} · {m.label}
                  {m.damaged ? " (damaged stock)" : ""}
                  {m.note ? ` · ${m.note}` : ""} · {m.by}
                </div>
              </div>
              <b className={`whitespace-nowrap ${m.qty < 0 ? "text-coral" : "text-mint"}`}>{m.qty > 0 ? `+${m.qty}` : m.qty}</b>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <Empty>No movements yet.</Empty>
        </div>
      )}
    </>
  );
}
