// R56: Order tracker: every school order from the received PO to the last payment, in one list:
// PO received → Sales order → Production → Dispatch → Invoice → Payment, with what is next and how late it is.
import { db } from "@/lib/db";
import { fromDbDate, todayIST } from "@/lib/dates";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope } from "./access";
import { invoiceRows } from "./finance/service";
import { getFeatures } from "./features";

export type TrackStage = "SO" | "PRODUCTION" | "DISPATCH" | "TRANSIT" | "INVOICE" | "PAYMENT" | "DONE" | "CANCELLED";
export const TRACK_STAGE_LABEL: Record<TrackStage, string> = {
  SO: "Make sales order",
  PRODUCTION: "In production",
  DISPATCH: "To dispatch",
  TRANSIT: "In transit",
  INVOICE: "To invoice",
  PAYMENT: "Payment due",
  DONE: "Completed",
  CANCELLED: "Cancelled",
};
/** Filter chips: which stages each shows. */
export const TRACK_FILTERS: Record<string, { label: string; stages: TrackStage[] }> = {
  "": { label: "Open", stages: ["SO", "PRODUCTION", "DISPATCH", "TRANSIT", "INVOICE", "PAYMENT"] },
  so: { label: "PO received, no sales order", stages: ["SO"] },
  production: { label: "In production", stages: ["PRODUCTION"] },
  dispatch: { label: "To dispatch", stages: ["DISPATCH"] },
  transit: { label: "In transit", stages: ["TRANSIT"] },
  invoice: { label: "To invoice", stages: ["INVOICE"] },
  payment: { label: "Payment due", stages: ["PAYMENT"] },
  done: { label: "Completed", stages: ["DONE"] },
  all: { label: "All", stages: ["SO", "PRODUCTION", "DISPATCH", "TRANSIT", "INVOICE", "PAYMENT", "DONE", "CANCELLED"] },
};

type Step = { state: "done" | "now" | "todo" | "skip"; title: string; lines: string[] };

export async function orderTracker(user: SessionUser, f: { show?: string; q?: string; owner?: string } = {}) {
  const features = await getFeatures();
  const owner = seesAllSales(user.role) && f.owner ? { ownerId: f.owner } : {};
  const [pos, orders, invoices] = await Promise.all([
    // Received POs not yet made into a sales order.
    db.quotation.findMany({
      where: {
        poReceivedAt: { not: null },
        salesOrders: { none: { status: { not: "CANCELLED" } } },
        OR: [{ client: { ...clientScope(user), ...owner } }, { opportunity: { client: { ...clientScope(user), ...owner } } }, { opportunity: { renewalOf: { ...clientScope(user), ...owner } } }],
      },
      include: {
        client: { select: { id: true, schoolName: true, city: true, owner: { select: { name: true } } } },
        opportunity: {
          select: {
            client: { select: { id: true, schoolName: true, city: true, owner: { select: { name: true } } } },
            renewalOf: { select: { id: true, schoolName: true, city: true, owner: { select: { name: true } } } },
          },
        },
        items: { select: { price: true }, orderBy: { sortOrder: "asc" } },
      },
      orderBy: { poReceivedAt: "asc" },
    }),
    db.salesOrder.findMany({
      where: { client: { ...clientScope(user), ...owner } },
      include: {
        client: { select: { id: true, schoolName: true, city: true, owner: { select: { name: true } } } },
        quotation: { select: { number: true, schoolPoNumber: true, schoolPoDate: true, poReceivedAt: true } },
        items: { select: { id: true, qty: true, price: true, gstRate: true } },
        productionOrder: { select: { number: true, status: true, lines: { select: { qty: true, made: true } } } },
        dispatches: { select: { number: true, isReplacement: true, receivedOn: true, items: { select: { qty: true } } }, orderBy: { createdAt: "asc" } },
        materialIssues: { where: { status: "OPEN" }, select: { id: true } },
      },
      orderBy: { date: "desc" },
      take: 500,
    }),
    invoiceRows(user),
  ]);
  const today = todayIST();
  const invBySo = new Map<string, typeof invoices>();
  for (const r of invoices) if (r.state !== "CANCELLED") invBySo.set(r.salesOrder.id, [...(invBySo.get(r.salesOrder.id) ?? []), r]);
  const dmy = (d: string) => d.split("-").reverse().join("/");

  const fromPos = pos.map((q) => {
    const c = q.client ?? q.opportunity?.client ?? q.opportunity?.renewalOf ?? null;
    const received = fromDbDate(q.poReceivedAt!);
    const steps: Step[] = [
      { state: "done", title: "PO received", lines: [`PO ${q.schoolPoNumber ?? ""}`, q.schoolPoDate ? `dated ${dmy(fromDbDate(q.schoolPoDate))}` : `received ${dmy(received)}`, `Quotation ${q.number}`] },
      { state: "now", title: "Sales order", lines: ["Not made yet"] },
      ...(features.inventory ? [{ state: "todo" as const, title: "Production", lines: [] }] : []),
      { state: "todo", title: "Dispatch", lines: [] },
      { state: "todo", title: "Invoice", lines: [] },
      { state: "todo", title: "Payment", lines: [] },
    ];
    return {
      key: `q${q.id}`,
      client: c ? { id: c.id, schoolName: c.schoolName, city: c.city } : { id: null as string | null, schoolName: q.schoolName, city: "" },
      salesperson: c?.owner.name ?? "",
      date: received,
      ref: `PO ${q.schoolPoNumber ?? ""}`,
      stage: "SO" as TrackStage,
      next: c ? "Create the sales order from this PO (client → Quotations & orders → New sales order)" : "Convert the deal to a client, then create the sales order",
      lateDays: Math.max(0, Math.round((Date.parse(today) - Date.parse(received)) / 86400000)),
      lateLabel: "days since PO",
      value: null as number | null,
      steps,
      href: c ? `/clients/${c.id}?tab=sales` : null,
    };
  });

  const fromOrders = orders.map((so) => {
    const kits = so.items.reduce((t, i) => t + i.qty, 0);
    const value = so.items.reduce((t, i) => t + i.qty * Number(i.price) * (1 + Number(i.gstRate) / 100), 0);
    const lots = so.dispatches.filter((d) => !d.isReplacement);
    const sent = lots.reduce((t, d) => t + d.items.reduce((n, x) => n + x.qty, 0), 0);
    const inTransit = lots.filter((d) => !d.receivedOn).length;
    const received = lots.filter((d) => d.receivedOn).reduce((t, d) => t + d.items.reduce((n, x) => n + x.qty, 0), 0);
    const prod = so.productionOrder;
    const made = prod ? prod.lines.reduce((t, l) => t + l.made, 0) : 0;
    const toMake = prod ? prod.lines.reduce((t, l) => t + l.qty, 0) : 0;
    const invs = invBySo.get(so.id) ?? [];
    const billed = invs.reduce((t, i) => t + i.total, 0);
    const balance = invs.reduce((t, i) => t + i.balance, 0);
    const overdue = invs.some((i) => i.state === "OVERDUE");
    const cancelled = so.status === "CANCELLED";
    const producing = features.inventory && prod && (prod.status === "PLANNED" || prod.status === "IN_PRODUCTION");
    const stage: TrackStage = cancelled
      ? "CANCELLED"
      : producing && sent < kits
        ? "PRODUCTION"
        : sent < kits
          ? "DISPATCH"
          : inTransit
            ? "TRANSIT"
            : !invs.length
              ? "INVOICE"
              : balance > 0.5
                ? "PAYMENT"
                : "DONE";
    const due = so.expectedDelivery ? fromDbDate(so.expectedDelivery) : null;
    const lateDays = due && sent < kits && !cancelled ? Math.max(0, Math.round((Date.parse(today) - Date.parse(due)) / 86400000)) : 0;
    const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
    const q = so.quotation;
    const steps: Step[] = [
      {
        state: so.poNumber || q?.schoolPoNumber ? "done" : "todo",
        title: "PO received",
        lines: [
          so.poNumber || q?.schoolPoNumber ? `PO ${so.poNumber ?? q?.schoolPoNumber}` : "No PO recorded",
          ...(so.poDate ? [`dated ${dmy(fromDbDate(so.poDate))}`] : q?.schoolPoDate ? [`dated ${dmy(fromDbDate(q.schoolPoDate))}`] : []),
          ...(q ? [`Quotation ${q.number}`] : []),
        ],
      },
      {
        state: cancelled ? "skip" : "done",
        title: "Sales order",
        lines: [so.number, `${kits} kits · ${inr(value)}`, ...(due ? [`deliver by ${dmy(due)}`] : []), ...(cancelled ? ["Cancelled"] : [])],
      },
      ...(features.inventory
        ? [
            {
              state: (!prod || prod.status === "CANCELLED" ? "skip" : prod.status === "READY" ? "done" : stage === "PRODUCTION" ? "now" : "done") as Step["state"],
              title: "Production",
              lines: prod
                ? [prod.number, prod.status === "READY" ? "Ready" : prod.status === "CANCELLED" ? "Cancelled" : prod.status === "PLANNED" ? "To start" : "In production", ...(toMake ? [`${made} of ${toMake} kits done`] : [])]
                : ["No production order"],
            },
          ]
        : []),
      {
        state: cancelled ? "skip" : sent >= kits && kits ? (inTransit ? "now" : "done") : stage === "DISPATCH" ? "now" : "todo",
        title: "Dispatch",
        lines: [
          `${sent} of ${kits} kits sent`,
          ...(lots.length ? [`${lots.length} challan(s)${inTransit ? ` · ${inTransit} in transit` : ""}`] : []),
          ...(received ? [`${received} received`] : []),
          ...(so.materialIssues.length ? [`${so.materialIssues.length} material problem(s) open`] : []),
        ],
      },
      {
        state: cancelled ? "skip" : invs.length ? "done" : stage === "INVOICE" ? "now" : "todo",
        title: "Invoice",
        lines: invs.length ? [...invs.map((i) => i.number), inr(billed)] : ["Not invoiced"],
      },
      {
        state: cancelled ? "skip" : invs.length && balance <= 0.5 ? "done" : stage === "PAYMENT" ? "now" : "todo",
        title: "Payment",
        lines: invs.length ? (balance > 0.5 ? [`${inr(balance)} due`, ...(overdue ? ["Overdue"] : [])] : ["Paid"]) : [],
      },
    ];
    const next: Record<TrackStage, string> = {
      SO: "",
      PRODUCTION: prod?.status === "PLANNED" ? "Production team: start production" : `Production team: finish the kits (${toMake - made} left)`,
      DISPATCH: `Dispatch ${kits - sent} kit(s)`,
      TRANSIT: "Get the school's proof of delivery and mark received",
      INVOICE: "Create the invoice",
      PAYMENT: overdue ? "Collect the overdue payment" : "Collect the payment",
      DONE: "Nothing: completed",
      CANCELLED: "—",
    };
    return {
      key: so.id,
      client: { id: so.clientId as string | null, schoolName: so.client.schoolName, city: so.client.city },
      salesperson: so.client.owner.name,
      date: fromDbDate(so.date),
      ref: so.number,
      stage,
      next: next[stage],
      lateDays,
      lateLabel: "days late",
      value: Math.round(value),
      steps,
      href: `/clients/${so.clientId}?tab=sales`,
    };
  });

  const filter = TRACK_FILTERS[f.show ?? ""] ?? TRACK_FILTERS[""];
  const q = (f.q ?? "").trim().toLowerCase();
  const all = [...fromPos, ...fromOrders];
  const rows = all
    .filter((r) => filter.stages.includes(r.stage))
    .filter((r) => !q || `${r.client.schoolName} ${r.ref} ${r.steps.flatMap((s) => s.lines).join(" ")}`.toLowerCase().includes(q))
    // Most urgent first: late, then stage order, then oldest.
    .sort((a, b) => b.lateDays - a.lateDays || Object.keys(TRACK_STAGE_LABEL).indexOf(a.stage) - Object.keys(TRACK_STAGE_LABEL).indexOf(b.stage) || a.date.localeCompare(b.date));
  const counts = Object.fromEntries(Object.entries(TRACK_FILTERS).map(([k, v]) => [k, all.filter((r) => v.stages.includes(r.stage)).length]));
  return { rows, counts, inventory: features.inventory };
}
