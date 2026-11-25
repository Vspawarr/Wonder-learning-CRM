// R54: inventory and production, for what the CRM sells (kits, their items, other books). Not paper, ink and other
// raw material.
// - Stock items: every item inside the kits, the other books, and the finished kits (kept in step with Products).
//   Items in a kit's "Class Connect" section (the class books / notebooks) are separate for each class; the rest
//   (bag, diary, flash cards…) is shared by all kits.
// - Stock moves: every change; good and damaged stock are kept apart; balances are their sum.
// - Production order: made by itself when a sales order is created from the school's received PO; the production
//   team marks it In production → Ready. Ready adds the finished kits to stock and takes their items out.
// - Dispatch takes finished kits (and items sold on their own) out; returned material comes back as good or damaged.
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { customSections, isCustomised, type KitCustom } from "@/lib/kit-custom";
import type { KitSection } from "@/lib/quotation-text";
import { fromDbDate, isDateStr, toDbDate, todayIST } from "@/lib/dates";
import { canManageInventory, type SessionUser } from "@/lib/permissions";
import { clientScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { getFeatures } from "./features";
import { parse } from "./validation";

type Tx = Prisma.TransactionClient;

export const MOVE_LABEL: Record<string, string> = {
  OPENING: "Opening stock",
  ADJUST: "Adjustment",
  PRODUCED: "Produced",
  USED: "Used in production",
  DISPATCHED: "Dispatched",
  RETURNED: "Returned (good)",
  DAMAGED: "Returned damaged",
  WRITE_OFF: "Damaged written off",
  REPAIRED: "Damaged → good",
};
export const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  PLANNED: "To start",
  IN_PRODUCTION: "In production",
  READY: "Ready",
  CANCELLED: "Cancelled",
};

export async function inventoryOn() {
  return (await getFeatures()).inventory;
}
async function assertOn() {
  if (!(await inventoryOn())) throw new DomainError("Inventory is switched off in Settings → Features.");
}
function assertManager(user: SessionUser) {
  if (!canManageInventory(user.role)) throw new DomainError("Only the production team, an Admin or the Sales Head can change stock.");
}

const asSections = (v: unknown): KitSection[] =>
  Array.isArray(v) ? v.filter((x): x is KitSection => !!x && typeof x.title === "string" && Array.isArray(x.items)) : [];
const classOf = (kitName: string) => kitName.replace(/\s+kit$/i, "").trim();
/** The stock name of an item in a kit: class books / notebooks are per class, the rest is shared. */
export const componentName = (kitName: string, sectionTitle: string, item: string) =>
  /^class connect/i.test(sectionTitle.trim()) ? `${classOf(kitName)} – ${item}` : item;

/* ---------- stock items, kept in step with Settings → Products ---------- */

/** Creates the stock items for every kit, kit item and product sold on its own; renames follow the product. */
export async function syncStockItems(tx: Tx | typeof db = db) {
  const products = await tx.product.findMany({ select: { id: true, name: true, contents: true, active: true } });
  const existing = await tx.stockItem.findMany({ select: { id: true, name: true, productId: true } });
  const byProduct = new Map(existing.filter((e) => e.productId).map((e) => [e.productId!, e]));
  const names = new Set(existing.map((e) => e.name));
  for (const p of products) {
    const sections = asSections(p.contents);
    const kind = sections.length ? "KIT" : "ITEM";
    const have = byProduct.get(p.id);
    if (have) {
      if (have.name !== p.name && !names.has(p.name)) {
        await tx.stockItem.update({ where: { id: have.id }, data: { name: p.name } });
        names.add(p.name);
      }
    } else if (p.active) {
      const taken = existing.find((e) => e.name === p.name && !e.productId);
      if (taken) await tx.stockItem.update({ where: { id: taken.id }, data: { productId: p.id, kind } });
      else if (!names.has(p.name)) await tx.stockItem.create({ data: { name: p.name, kind, productId: p.id } });
      names.add(p.name);
    }
    if (!p.active) continue;
    for (const s of sections)
      for (const item of s.items) {
        const name = componentName(p.name, s.title, item);
        if (names.has(name)) continue;
        await tx.stockItem.create({ data: { name, kind: "ITEM" } });
        names.add(name);
      }
  }
}

/** The items one kit of this order line needs (removed items left out, added items in), by stock name. */
function kitComponents(kitName: string, sections: KitSection[], custom: KitCustom | null, addedNames: Map<string, string>) {
  const out = new Map<string, number>();
  const sec = isCustomised(custom) ? customSections(sections, custom) : sections;
  for (const s of sec) {
    const added = s.title === "Added for this school";
    for (const item of s.items) {
      const name = added ? (addedNames.get(item) ?? item) : componentName(kitName, s.title, item);
      out.set(name, (out.get(name) ?? 0) + 1);
    }
  }
  return [...out.entries()].map(([name, qty]) => ({ name, qty }));
}

/* ---------- production orders ---------- */

async function nextProductionNumber(tx: Tx) {
  const [y, m] = todayIST().split("-").map(Number);
  const agg = await tx.productionOrder.aggregate({ where: { year: y, month: m }, _max: { seq: true } });
  const seq = (agg._max.seq ?? 0) + 1;
  return { number: `PRD/${y}/${String(m).padStart(2, "0")}/${String(seq).padStart(3, "0")}`, year: y, month: m, seq };
}

/** The kit lines of a sales order with the items each kit needs (from the quotation's kit changes when there are any). */
async function orderKitLines(tx: Tx | typeof db, salesOrderId: string) {
  const so = await tx.salesOrder.findUniqueOrThrow({
    where: { id: salesOrderId },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { product: { select: { id: true, name: true, contents: true } } } },
      quotation: { select: { items: { orderBy: { sortOrder: "asc" }, select: { productId: true, description: true, kit: true } } } },
    },
  });
  const optional = await tx.product.findMany({ select: { id: true, name: true } });
  const productName = new Map(optional.map((p) => [p.id, p.name]));
  const quoteItems = so.quotation?.items ?? [];
  return so.items.flatMap((it, i) => {
    const sections = asSections(it.product?.contents);
    if (!it.product || !sections.length) return [];
    // The quotation line it came from: same position and product, else same description.
    const q = (quoteItems[i]?.productId === it.productId ? quoteItems[i] : null) ?? quoteItems.find((x) => x.description === it.description) ?? null;
    const custom = (q?.kit ?? null) as KitCustom | null;
    const added = new Map((custom?.added ?? []).map((a) => [a.name, a.productId ? (productName.get(a.productId) ?? a.name) : a.name]));
    return [{ productId: it.product.id, kitName: it.product.name, description: it.description, qty: it.qty, sortOrder: i, components: kitComponents(it.product.name, sections, custom, added) }];
  });
}

/**
 * Makes (or, while not started, remakes) the production order of a sales order. Called when a sales order is created
 * or changed; does nothing with inventory switched off, for an order without kits, or once production has started.
 */
export async function syncProductionOrder(salesOrderId: string) {
  if (!(await inventoryOn())) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await syncStockItems(tx);
        const so = await tx.salesOrder.findUniqueOrThrow({ where: { id: salesOrderId }, include: { productionOrder: true } });
        const po = so.productionOrder;
        if (po && po.status !== "PLANNED") return po.id;
        const lines = so.status === "CANCELLED" ? [] : await orderKitLines(tx, so.id);
        if (!lines.length) {
          if (po) await tx.productionOrder.update({ where: { id: po.id }, data: { status: "CANCELLED" } });
          return po?.id ?? null;
        }
        const items = new Map((await tx.stockItem.findMany({ select: { id: true, productId: true } })).filter((s) => s.productId).map((s) => [s.productId!, s.id]));
        const data = lines.map((l, i) => ({ stockItemId: items.get(l.productId)!, description: l.description, qty: l.qty, components: l.components, sortOrder: i }));
        if (po) {
          await tx.productionLine.deleteMany({ where: { productionOrderId: po.id } });
          await tx.productionOrder.update({ where: { id: po.id }, data: { dueDate: so.expectedDelivery, lines: { create: data } } });
          return po.id;
        }
        const n = await nextProductionNumber(tx);
        const created = await tx.productionOrder.create({
          data: { ...n, salesOrderId: so.id, clientId: so.clientId, dueDate: so.expectedDelivery, lines: { create: data } },
        });
        return created.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new DomainError("Couldn't number the production order. Please try again.");
}

async function loadProduction(user: SessionUser, id: string) {
  const po = await db.productionOrder.findFirst({ where: { id, ...(canManageInventory(user.role) ? {} : { client: clientScope(user) }) }, include: { lines: true, salesOrder: { select: { number: true } } } });
  if (!po) throw new NotFoundError("Production order");
  return po;
}

/** In production → Ready, Cancel, or undo Ready. Ready adds the finished kits and takes their items out of stock. */
export async function setProductionStatus(user: SessionUser, id: string, to: "IN_PRODUCTION" | "READY" | "CANCELLED" | "UNDO_READY") {
  await assertOn();
  assertManager(user);
  const po = await loadProduction(user, id);
  const allowed: Record<string, string[]> = { IN_PRODUCTION: ["PLANNED"], READY: ["PLANNED", "IN_PRODUCTION"], CANCELLED: ["PLANNED", "IN_PRODUCTION"], UNDO_READY: ["READY"] };
  if (!allowed[to].includes(po.status)) throw new DomainError(`This production order is ${PRODUCTION_STATUS_LABEL[po.status].toLowerCase()}.`);
  await db.$transaction(async (tx) => {
    if (to === "UNDO_READY") {
      await tx.stockMove.deleteMany({ where: { productionOrderId: po.id } });
      await tx.productionOrder.update({ where: { id: po.id }, data: { status: "IN_PRODUCTION", readyAt: null } });
      return;
    }
    if (to === "READY") {
      await syncStockItems(tx);
      const byName = new Map((await tx.stockItem.findMany({ select: { id: true, name: true } })).map((s) => [s.name, s.id]));
      const date = toDbDate(todayIST());
      const moves: Prisma.StockMoveCreateManyInput[] = [];
      for (const l of po.lines) {
        moves.push({ stockItemId: l.stockItemId, date, kind: "PRODUCED", qty: l.qty, productionOrderId: po.id, createdById: user.id, note: po.number });
        for (const c of l.components as { name: string; qty: number }[]) {
          let itemId = byName.get(c.name);
          if (!itemId) {
            itemId = (await tx.stockItem.create({ data: { name: c.name, kind: "ITEM" } })).id;
            byName.set(c.name, itemId);
          }
          moves.push({ stockItemId: itemId, date, kind: "USED", qty: -(c.qty * l.qty), productionOrderId: po.id, createdById: user.id, note: `${po.number} · ${l.description}` });
        }
      }
      await tx.stockMove.createMany({ data: moves });
    }
    await tx.productionOrder.update({
      where: { id: po.id },
      data: { status: to, ...(to === "IN_PRODUCTION" ? { startedAt: new Date() } : {}), ...(to === "READY" ? { readyAt: new Date(), startedAt: po.startedAt ?? new Date() } : {}) },
    });
    await tx.activity.create({
      data: { type: "SYSTEM", subject: `Production ${po.number} (${po.salesOrder.number}): ${PRODUCTION_STATUS_LABEL[to].toLowerCase()}`, byId: user.id, clientId: po.clientId },
    });
  });
}

/* ---------- stock moves from dispatch and returns ---------- */

/** Stock out for a dispatch lot: finished kits and items sold on their own (a replacement can name the item sent). */
export async function dispatchMoves(tx: Tx, user: SessionUser, dispatchId: string, lines: { salesOrderItemId: string; qty: number; stockItemId?: string | null }[]) {
  if (!(await inventoryOn())) return;
  await syncStockItems(tx);
  const items = await tx.salesOrderItem.findMany({ where: { id: { in: lines.map((l) => l.salesOrderItemId) } }, select: { id: true, productId: true, description: true } });
  const stock = new Map((await tx.stockItem.findMany({ where: { productId: { in: items.flatMap((i) => (i.productId ? [i.productId] : [])) } }, select: { id: true, productId: true } })).map((s) => [s.productId!, s.id]));
  const dc = await tx.dispatch.findUniqueOrThrow({ where: { id: dispatchId }, select: { number: true, date: true } });
  const data = lines.flatMap((l) => {
    const it = items.find((i) => i.id === l.salesOrderItemId);
    const stockItemId = l.stockItemId ?? (it?.productId ? stock.get(it.productId) : undefined);
    return stockItemId && l.qty ? [{ stockItemId, date: dc.date, kind: "DISPATCHED", qty: -l.qty, dispatchId, createdById: user.id, note: `${dc.number}${it ? ` · ${it.description}` : ""}` }] : [];
  });
  if (data.length) await tx.stockMove.createMany({ data });
}

/** Material that came back from a school, into good or damaged stock (the kit, or the item named). */
export async function returnMoves(tx: Tx, user: SessionUser, issueId: string, backTo: "GOOD" | "DAMAGED", stockItemId: string | null, qty: number) {
  if (!(await inventoryOn())) return;
  await syncStockItems(tx);
  const i = await tx.materialIssue.findUniqueOrThrow({ where: { id: issueId }, include: { salesOrderItem: { select: { productId: true, description: true } }, salesOrder: { select: { number: true } } } });
  const id = stockItemId ?? (i.salesOrderItem.productId ? (await tx.stockItem.findUnique({ where: { productId: i.salesOrderItem.productId } }))?.id : null);
  if (!id) return;
  await tx.stockMove.create({
    data: { stockItemId: id, date: i.date, kind: backTo === "GOOD" ? "RETURNED" : "DAMAGED", qty, damaged: backTo === "DAMAGED", materialIssueId: i.id, createdById: user.id, note: `${i.salesOrder.number} · ${i.salesOrderItem.description}` },
  });
}

/* ---------- adjustments ---------- */

export const adjustInput = z.object({
  stockItemId: z.string().min(1, "Choose the item."),
  kind: z.enum(["OPENING", "ADD", "REMOVE", "WRITE_OFF", "REPAIRED", "TO_DAMAGED"]),
  qty: z.coerce.number().int("Whole numbers only.").min(1, "Enter how many."),
  date: z.string().refine(isDateStr, "Enter the date."),
  note: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((s) => s || null),
});

/** Opening stock, additions / removals (e.g. a count), and damaged stock written off, repaired or set aside. */
export async function adjustStock(user: SessionUser, raw: unknown) {
  await assertOn();
  assertManager(user);
  const d = parse(adjustInput, raw);
  const item = await db.stockItem.findUnique({ where: { id: d.stockItemId } });
  if (!item) throw new NotFoundError("Item");
  if (d.kind === "REMOVE" && !d.note) throw new DomainError("Write why stock is removed.");
  const base = { stockItemId: item.id, date: toDbDate(d.date), note: d.note, createdById: user.id };
  const rows: Prisma.StockMoveCreateManyInput[] =
    d.kind === "OPENING"
      ? [{ ...base, kind: "OPENING", qty: d.qty }]
      : d.kind === "ADD"
        ? [{ ...base, kind: "ADJUST", qty: d.qty }]
        : d.kind === "REMOVE"
          ? [{ ...base, kind: "ADJUST", qty: -d.qty }]
          : d.kind === "WRITE_OFF"
            ? [{ ...base, kind: "WRITE_OFF", qty: -d.qty, damaged: true }]
            : d.kind === "REPAIRED"
              ? [
                  { ...base, kind: "REPAIRED", qty: -d.qty, damaged: true },
                  { ...base, kind: "REPAIRED", qty: d.qty },
                ]
              : [
                  { ...base, kind: "DAMAGED", qty: -d.qty },
                  { ...base, kind: "DAMAGED", qty: d.qty, damaged: true },
                ];
  if (d.kind === "WRITE_OFF" || d.kind === "REPAIRED") {
    const dmg = await db.stockMove.aggregate({ where: { stockItemId: item.id, damaged: true }, _sum: { qty: true } });
    if (d.qty > (dmg._sum.qty ?? 0)) throw new DomainError(`Only ${dmg._sum.qty ?? 0} damaged ${item.name} in stock.`);
  }
  await db.stockMove.createMany({ data: rows });
}

export async function setReorderLevel(user: SessionUser, id: string, level: number | null) {
  await assertOn();
  assertManager(user);
  if (level !== null && (!Number.isInteger(level) || level < 0)) throw new DomainError("Enter a whole number, or leave it empty.");
  await db.stockItem.update({ where: { id }, data: { reorderLevel: level } });
}

/* ---------- what the screens show ---------- */

/** Stock per item: good, damaged, still needed by open production, kits still to dispatch, and what is free. */
export async function stockLevels() {
  await syncStockItems();
  const [items, sums, open, toSend] = await Promise.all([
    db.stockItem.findMany({ where: { active: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.stockMove.groupBy({ by: ["stockItemId", "damaged"], _sum: { qty: true } }),
    db.productionLine.findMany({ where: { productionOrder: { status: { in: ["PLANNED", "IN_PRODUCTION"] } } }, select: { stockItemId: true, qty: true, components: true } }),
    // Kits on open orders not yet sent (normal lots only).
    db.salesOrderItem.findMany({
      where: { productId: { not: null }, salesOrder: { status: "CONFIRMED" } },
      select: { productId: true, qty: true, dispatched: { where: { dispatch: { isReplacement: false } }, select: { qty: true } } },
    }),
  ]);
  const good = new Map<string, number>();
  const damaged = new Map<string, number>();
  for (const s of sums) (s.damaged ? damaged : good).set(s.stockItemId, (s._sum.qty ?? 0) + ((s.damaged ? damaged : good).get(s.stockItemId) ?? 0));
  const needByName = new Map<string, number>();
  const making = new Map<string, number>();
  for (const l of open) {
    making.set(l.stockItemId, (making.get(l.stockItemId) ?? 0) + l.qty);
    for (const c of l.components as { name: string; qty: number }[]) needByName.set(c.name, (needByName.get(c.name) ?? 0) + c.qty * l.qty);
  }
  const sendByProduct = new Map<string, number>();
  for (const i of toSend) sendByProduct.set(i.productId!, (sendByProduct.get(i.productId!) ?? 0) + Math.max(0, i.qty - i.dispatched.reduce((t, d) => t + d.qty, 0)));
  return items.map((i) => {
    const g = good.get(i.id) ?? 0;
    const need = needByName.get(i.name) ?? 0;
    const toDispatch = i.productId ? (sendByProduct.get(i.productId) ?? 0) : 0;
    const inProduction = making.get(i.id) ?? 0;
    // Kits: in stock + being made − still to send. Items: in stock − what production still needs − what is sold on
    // its own and still to send.
    const free = i.kind === "KIT" ? g + inProduction - toDispatch : g - need - toDispatch;
    return {
      id: i.id,
      name: i.name,
      kind: i.kind as "KIT" | "ITEM",
      sold: !!i.productId,
      good: g,
      damaged: damaged.get(i.id) ?? 0,
      needed: need,
      inProduction,
      toDispatch,
      free,
      reorderLevel: i.reorderLevel,
      state: free < 0 ? ("SHORT" as const) : i.reorderLevel !== null && g <= i.reorderLevel ? ("LOW" as const) : ("OK" as const),
    };
  });
}

/** Production orders, newest first, with what each still needs against today's stock. */
export async function productionOrders(user: SessionUser, show?: string) {
  const where: Prisma.ProductionOrderWhereInput = {
    ...(canManageInventory(user.role) ? {} : { client: clientScope(user) }),
    ...(show === "all" ? {} : show === "done" ? { status: { in: ["READY", "CANCELLED"] } } : { status: { in: ["PLANNED", "IN_PRODUCTION"] } }),
  };
  const [rows, levels] = await Promise.all([
    db.productionOrder.findMany({
      where,
      include: { lines: { orderBy: { sortOrder: "asc" } }, client: { select: { id: true, schoolName: true, city: true } }, salesOrder: { select: { id: true, number: true, poNumber: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 300,
    }),
    stockLevels(),
  ]);
  const goodByName = new Map(levels.map((l) => [l.name, l.good]));
  return rows.map((p) => {
    const need = new Map<string, number>();
    for (const l of p.lines) for (const c of l.components as { name: string; qty: number }[]) need.set(c.name, (need.get(c.name) ?? 0) + c.qty * l.qty);
    const items = [...need.entries()].map(([name, qty]) => ({ name, qty, inStock: goodByName.get(name) ?? 0 }));
    return {
      id: p.id,
      number: p.number,
      status: p.status as "PLANNED" | "IN_PRODUCTION" | "READY" | "CANCELLED",
      dueDate: p.dueDate ? fromDbDate(p.dueDate) : null,
      createdAt: p.createdAt.toISOString(),
      readyAt: p.readyAt?.toISOString() ?? null,
      client: p.client,
      salesOrder: p.salesOrder,
      lines: p.lines.map((l) => ({ description: l.description, qty: l.qty })),
      kits: p.lines.reduce((t, l) => t + l.qty, 0),
      items,
      short: p.status === "PLANNED" || p.status === "IN_PRODUCTION" ? items.filter((i) => i.qty > i.inStock).length : 0,
    };
  });
}

/** Recent stock moves (newest first), optionally for one item. */
export async function stockMoves(f: { item?: string; kind?: string; from?: string; to?: string } = {}) {
  const rows = await db.stockMove.findMany({
    where: {
      ...(f.item ? { stockItemId: f.item } : {}),
      ...(f.kind ? { kind: f.kind } : {}),
      ...(f.from || f.to ? { date: { ...(f.from ? { gte: toDbDate(f.from) } : {}), ...(f.to ? { lte: toDbDate(f.to) } : {}) } } : {}),
    },
    include: { stockItem: { select: { name: true } }, createdBy: { select: { name: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((m) => ({
    id: m.id,
    date: fromDbDate(m.date),
    item: m.stockItem.name,
    kind: m.kind,
    label: MOVE_LABEL[m.kind] ?? m.kind,
    qty: m.qty,
    damaged: m.damaged,
    note: m.note,
    by: m.createdBy.name,
  }));
}

/** Counts for the dashboard: open production orders, and items short or low. */
export async function inventorySummary() {
  if (!(await inventoryOn())) return null;
  const [open, levels] = await Promise.all([db.productionOrder.count({ where: { status: { in: ["PLANNED", "IN_PRODUCTION"] } } }), stockLevels()]);
  return { openProduction: open, short: levels.filter((l) => l.state === "SHORT").length, low: levels.filter((l) => l.state === "LOW").length };
}

/** The stock items for an order line: its kit (or product) first, then the kit's items. */
export async function stockChoices(salesOrderItemId: string) {
  if (!(await inventoryOn())) return [];
  await syncStockItems();
  const it = await db.salesOrderItem.findUnique({ where: { id: salesOrderItemId }, select: { product: { select: { id: true, name: true, contents: true } } } });
  if (!it?.product) return [];
  const names = [...new Set(asSections(it.product.contents).flatMap((s) => s.items.map((i) => componentName(it.product!.name, s.title, i))))];
  const items = await db.stockItem.findMany({ where: { OR: [{ productId: it.product.id }, { name: { in: names } }] }, select: { id: true, name: true, productId: true } });
  const kit = items.find((i) => i.productId === it.product!.id);
  return [...(kit ? [{ id: kit.id, name: `${kit.name} (whole kit)` }] : []), ...names.flatMap((n) => items.filter((i) => i.name === n && i.id !== kit?.id).map((i) => ({ id: i.id, name: i.name })))];
}

/** For an order made before inventory was switched on: make its production order now (Admin / Sales Head). */
export async function makeProductionOrder(user: SessionUser, salesOrderId: string) {
  await assertOn();
  assertManager(user);
  const so = await db.salesOrder.findFirst({ where: { id: salesOrderId, client: clientScope(user) }, select: { id: true, status: true } });
  if (!so) throw new NotFoundError("Sales order");
  if (so.status !== "CONFIRMED") throw new DomainError("Only an open (confirmed) order can get a production order.");
  const id = await syncProductionOrder(so.id);
  if (!id) throw new DomainError("This order has no kits to produce.");
}
