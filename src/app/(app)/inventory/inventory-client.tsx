"use client";

// R54: the Inventory screen: production orders (start → ready), stock of every kit and item (adjust, reorder
// levels, damaged stock) and the movements list. Filters live in the address so exports match the screen.
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Empty, Pill, Table } from "@/components/ui";
import { adjustStock, completeProduction, productionReadyPlan, setProductionStatus, setReorderLevel } from "@/app/actions";
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
  const [ready, setReady] = useState<Order | null>(null);
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
                    {o.made && o.status !== "READY" ? <Pill tone="info">{`${o.made} of ${o.kits} kits done`}</Pill> : null}
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
                        {l.made && l.made < l.qty ? ` (${l.made} done)` : ""}
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
                      <button className="btn sm pri" disabled={pending} onClick={() => setReady(o)}>
                        Mark ready
                      </button>
                      {!o.made ? (
                        <button className="btn sm ghost" disabled={pending} onClick={() => act(o, "CANCELLED", "Cancelled.", `Cancel ${o.number}?`)}>
                          Cancel
                        </button>
                      ) : null}
                    </>
                  ) : null}
                  {manage && o.made ? (
                    <button
                      className="btn sm ghost"
                      disabled={pending}
                      onClick={() =>
                        act(o, "UNDO_READY", "Finished kits undone; stock put back.", `Undo the ${o.made} finished kit(s) of ${o.number}? They come out of stock and their items go back. Only for a mistake.`)
                      }
                    >
                      Undo finished
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
      {ready ? <ReadyModal order={ready} onClose={() => setReady(null)} /> : null}
    </>
  );
}

/** R55: mark kits ready: everything at once as listed, or an editable list of kits finished and items used. */
function ReadyModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [plan, setPlan] = useState<Awaited<ReturnType<typeof productionReadyPlan>> | null>(null);
  const [kits, setKits] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const { pending, run } = useAction();
  useEffect(() => {
    let live = true;
    productionReadyPlan(order.id).then((p) => {
      if (!live) return;
      setPlan(p);
      setKits(Object.fromEntries(p.lines.map((l) => [l.id, String(l.left)])));
      setItems(Object.fromEntries(p.items.map((i) => [i.name, String(i.qty)])));
    });
    return () => {
      live = false;
    };
  }, [order.id]);
  const inStock = new Map(order.items.map((i) => [i.name, i.inStock]));
  // Items follow the kits typed, unless changed by hand.
  const recalc = (nextKits: Record<string, string>) => {
    if (!plan) return;
    const auto = new Map<string, number>();
    for (const l of plan.lines) for (const c of l.perKit) auto.set(c.name, (auto.get(c.name) ?? 0) + c.qty * (Number(nextKits[l.id]) || 0));
    setItems((cur) => Object.fromEntries(Object.keys(cur).map((n) => [n, edited.has(n) ? cur[n] : String(auto.get(n) ?? 0)])));
  };
  const left = plan ? plan.lines.reduce((t, l) => t + l.left, 0) : 0;
  const short = plan ? plan.items.filter((i) => i.qty > (inStock.get(i.name) ?? 0)) : [];
  const all = () =>
    run(() => completeProduction(order.id, { lines: plan!.lines.map((l) => ({ id: l.id, qty: l.left })), note }), {
      success: "All kits ready: added to stock, items taken out.",
      onDone: onClose,
    });
  const save = () =>
    run(
      () =>
        completeProduction(order.id, {
          lines: plan!.lines.map((l) => ({ id: l.id, qty: kits[l.id] || 0 })),
          items: Object.entries(items).map(([name, qty]) => ({ name, qty: qty || 0 })),
          note,
        }),
      { success: "Saved: stock updated.", onDone: onClose },
    );
  return (
    <Modal
      wide
      title={`Mark ready · ${order.number}`}
      sub={`${order.client.schoolName} · ${left} kit(s) left to make`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={pending || !plan} onClick={save}>
            Save this list
          </button>
          <button className="btn pri" disabled={pending || !plan} onClick={all}>
            Everything is ready
          </button>
        </>
      }
    >
      {!plan ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="note">
            <b>Everything is ready</b> puts all {left} kit(s) into stock and takes the items below out, as listed. Or change any number
            below (fewer kits finished, more of an item used) and <b>Save this list</b>; if fewer kits are finished, the rest stays in
            production.
          </div>
          {short.length ? (
            <div className="note bad">
              {short.length} item(s) are short in the CRM&apos;s stock ({short.map((s) => s.name).slice(0, 4).join(", ")}
              {short.length > 4 ? "…" : ""}), so their stock will go below zero. Enter opening stock or stock received first if it&apos;s
              really there.
            </div>
          ) : null}
          <h3 className="mt-3">Kits finished now</h3>
          <div className="mt-2 flex flex-col gap-2">
            {plan.lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2">
                <label className="min-w-0" htmlFor={`rk-${l.id}`}>
                  {l.description}
                  <span className="small faint block">
                    {l.made ? `${l.made} of ${l.ordered} done · ` : ""}
                    {l.left} left
                  </span>
                </label>
                <input
                  className="in text-right"
                  id={`rk-${l.id}`}
                  inputMode="numeric"
                  disabled={!l.left}
                  value={kits[l.id] ?? ""}
                  onChange={(e) => {
                    const next = { ...kits, [l.id]: e.target.value };
                    setKits(next);
                    recalc(next);
                  }}
                />
              </div>
            ))}
          </div>
          <h3 className="mt-4">Items taken out of stock</h3>
          <p className="small muted">Worked out from the kits; change any number if more or less was used.</p>
          <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 min-[701px]:grid-cols-2">
            {plan.items.map((i) => (
              <div key={i.name} className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-2">
                <label className="min-w-0 text-[13px]" htmlFor={`ri-${i.name}`}>
                  <span className={`block truncate ${edited.has(i.name) ? "font-bold" : ""}`}>{i.name}</span>
                  <span className={`small block ${Number(items[i.name] || 0) > (inStock.get(i.name) ?? 0) ? "text-coral" : "faint"}`}>{inStock.get(i.name) ?? 0} in stock</span>
                </label>
                <input
                  className="in text-right"
                  id={`ri-${i.name}`}
                  inputMode="numeric"
                  value={items[i.name] ?? ""}
                  onChange={(e) => {
                    setItems({ ...items, [i.name]: e.target.value });
                    setEdited(new Set(edited).add(i.name));
                  }}
                />
              </div>
            ))}
          </div>
          <Field label="Note" htmlFor="rk-note">
            <input className="in" id="rk-note" placeholder="Optional, e.g. first batch" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
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
