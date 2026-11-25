// R54: inventory exports (PDF / Excel): stock, production orders, stock movements.
import type { SessionUser } from "@/lib/permissions";
import { dmy } from "@/lib/format";
import { MOVE_LABEL, PRODUCTION_STATUS_LABEL, productionOrders, stockLevels, stockMoves } from "../inventory";
import type { Report } from "./types";

type Params = Record<string, string | undefined>;
const STATE = { SHORT: "Short", LOW: "Low", OK: "" } as const;

export async function stock(_user: SessionUser, p: Params): Promise<Report> {
  const all = await stockLevels();
  const rows = all.filter((l) => (p.show === "kits" ? l.kind === "KIT" : p.show === "items" ? l.kind === "ITEM" : p.show === "alert" ? l.state !== "OK" : p.show === "damaged" ? l.damaged > 0 : true));
  return {
    title: "Stock",
    subtitle: { kits: "Finished kits", items: "Items", alert: "Short or low", damaged: "With damaged stock" }[p.show ?? ""] ?? "All kits and items",
    landscape: true,
    sections: [
      {
        columns: [
          { key: "name", header: "Item", width: 2.4 },
          { key: "kind", header: "Type", width: 0.8 },
          { key: "good", header: "In stock", kind: "number" },
          { key: "damaged", header: "Damaged", kind: "number" },
          { key: "making", header: "In production", kind: "number" },
          { key: "need", header: "Needed for production", kind: "number" },
          { key: "send", header: "To dispatch", kind: "number" },
          { key: "free", header: "Free", kind: "number" },
          { key: "reorder", header: "Reorder at", kind: "number" },
          { key: "state", header: "Status", width: 0.7 },
        ],
        rows: rows.map((l) => ({
          name: l.name,
          kind: l.kind === "KIT" ? "Kit" : l.sold ? "Item (sold)" : "Item",
          good: l.good,
          damaged: l.damaged,
          making: l.kind === "KIT" ? l.inProduction : null,
          need: l.kind === "ITEM" ? l.needed : null,
          send: l.toDispatch || null,
          free: l.free,
          reorder: l.reorderLevel,
          state: STATE[l.state],
        })),
        empty: "Nothing to show.",
      },
    ],
  };
}

export async function production(user: SessionUser, p: Params): Promise<Report> {
  const rows = await productionOrders(user, p.show);
  return {
    title: "Production orders",
    subtitle: p.show === "all" ? "All" : p.show === "done" ? "Ready or cancelled" : "Open (to start or in production)",
    landscape: true,
    sections: [
      {
        columns: [
          { key: "no", header: "Production order", width: 1.2 },
          { key: "school", header: "School", width: 2 },
          { key: "so", header: "Sales order / PO", width: 1.5 },
          { key: "kits", header: "Kits", width: 2.4 },
          { key: "due", header: "Due", width: 0.8 },
          { key: "status", header: "Status", width: 0.9 },
          { key: "short", header: "Items short", kind: "number" },
        ],
        rows: rows.map((r) => ({
          no: r.number,
          school: r.client.schoolName,
          so: `${r.salesOrder.number}${r.salesOrder.poNumber ? ` · PO ${r.salesOrder.poNumber}` : ""}`,
          kits: r.lines.map((l) => `${l.qty} × ${l.description}`).join("; "),
          due: r.dueDate ? dmy(r.dueDate) : "",
          status: PRODUCTION_STATUS_LABEL[r.status],
          short: r.short || null,
        })),
        empty: "No production orders.",
      },
    ],
  };
}

export async function stockmoves(_user: SessionUser, p: Params): Promise<Report> {
  const rows = await stockMoves({ item: p.item, kind: p.kind, from: p.from, to: p.to });
  return {
    title: "Stock movements",
    subtitle: [p.kind && MOVE_LABEL[p.kind], p.from && `From ${dmy(p.from)}`, p.to && `to ${dmy(p.to)}`].filter(Boolean).join(" · ") || "Latest 500",
    landscape: true,
    sections: [
      {
        columns: [
          { key: "date", header: "Date", width: 0.8 },
          { key: "item", header: "Item", width: 2 },
          { key: "what", header: "What", width: 1.3 },
          { key: "qty", header: "Qty", kind: "number" },
          { key: "note", header: "Details", width: 2.4 },
          { key: "by", header: "By", width: 1 },
        ],
        rows: rows.map((m) => ({ date: dmy(m.date), item: m.item, what: `${m.label}${m.damaged ? " (damaged stock)" : ""}`, qty: m.qty, note: m.note ?? "", by: m.by })),
        empty: "No movements.",
      },
    ],
  };
}
