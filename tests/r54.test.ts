// R54: inventory: production orders from sales orders, stock in / out, returns and adjustments.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { CLASS_KITS, kitSections } from "@/lib/kits";
import { todayIST } from "@/lib/dates";
import { convertToClient } from "@/server/clients";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import { createDispatch, deleteDispatch } from "@/server/finance/dispatch";
import { reportIssue, sendReplacement } from "@/server/finance/material";
import { cancelSalesOrder, createSalesOrder, updateSalesOrder } from "@/server/finance/service";
import { adjustStock, completeProduction, componentName, productionOrders, readyPlan, setProductionStatus, stockLevels, stockMoves } from "@/server/inventory";
import { leadData, makeUser, resetData } from "./helpers";

const today = todayIST();
let ex: Awaited<ReturnType<typeof makeUser>>;
let prod: Awaited<ReturnType<typeof makeUser>>;
let clientId: string;
let lkg: { id: string; name: string };

beforeEach(async () => {
  await resetData();
  await db.appSetting.upsert({ where: { key: "features" }, create: { key: "features", value: { paymentApproval: false } }, update: { value: { paymentApproval: false } } });
  ex = await makeUser("SALES_EXECUTIVE");
  prod = await makeUser("PRODUCTION");
  const opp = await convertLead(ex, await createLead(ex, leadData(ex.id)), { temperature: "WARM" });
  await moveOpportunity(ex, opp, { stage: "WON" });
  clientId = await convertToClient(ex, opp);
  const k = CLASS_KITS.find((x) => x.code === "K03")!;
  lkg = await db.product.create({ data: { code: k.code, name: k.name, type: "MATERIAL", category: "Student kit", price: k.sp, gstRate: 0, contents: kitSections(k) }, select: { id: true, name: true } });
});

const level = async (name: string) => (await stockLevels()).find((l) => l.name === name)!;
const order = (qty: number) => createSalesOrder(ex, clientId, { date: today, items: [{ productId: lkg.id, description: "LKG Kit", qty, price: 3000, gstRate: 0 }] });

describe("inventory", () => {
  it("a sales order makes a production order; Ready adds kits and uses items; dispatch takes kits out", async () => {
    const so = await order(10);
    const [po] = await productionOrders(prod);
    expect(po).toMatchObject({ status: "PLANNED", kits: 10, salesOrder: { id: so } });
    const books = componentName(lkg.name, "Class Connect | Books & Notebooks", "Book 1 to 9");
    expect(books).toBe("LKG – Book 1 to 9");
    expect(po.items.find((i) => i.name === "Bag")).toMatchObject({ qty: 10, inStock: 0 });
    expect(po.short).toBeGreaterThan(0);
    // While planned, the production order follows the order.
    await updateSalesOrder(ex, so, { date: today, items: [{ productId: lkg.id, description: "LKG Kit", qty: 12, price: 3000, gstRate: 0 }] });
    expect((await productionOrders(prod))[0].kits).toBe(12);

    await adjustStock(prod, { stockItemId: (await level("Bag")).id, kind: "OPENING", qty: 50, date: today });
    await expect(setProductionStatus(ex, po.id, "READY")).rejects.toThrow(/production team/);
    await setProductionStatus(prod, po.id, "IN_PRODUCTION");
    await setProductionStatus(prod, po.id, "READY");
    expect(await level(lkg.name)).toMatchObject({ good: 12, toDispatch: 12, free: 0 });
    expect(await level("Bag")).toMatchObject({ good: 38, needed: 0 });
    expect((await level(books)).good).toBe(-12);

    const item = (await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: so } })).id;
    const dc = await createDispatch(ex, so, { date: today, lines: [{ itemId: item, qty: 8 }] });
    expect(await level(lkg.name)).toMatchObject({ good: 4, toDispatch: 4 });

    // A school returns 2 kits damaged; 3 bags were short and are replaced with bags only.
    await reportIssue(ex, so, { kind: "DAMAGED", itemId: item, qty: 2, date: today, dispatchId: dc, backTo: "DAMAGED" });
    expect(await level(lkg.name)).toMatchObject({ good: 4, damaged: 2 });
    const short = await reportIssue(ex, so, { kind: "SHORT", itemId: item, qty: 3, detail: "Bags", date: today, dispatchId: dc });
    const rep = await sendReplacement(ex, short, { date: today, stockItemId: (await level("Bag")).id });
    expect((await level("Bag")).good).toBe(35);
    // Deleting a lot puts its stock back.
    await deleteDispatch(ex, rep);
    expect((await level("Bag")).good).toBe(38);
    await deleteDispatch(ex, dc);
    expect((await level(lkg.name)).good).toBe(12);

    // Undo Ready takes the kits back out and returns the items.
    await setProductionStatus(prod, po.id, "UNDO_READY");
    expect(await level(lkg.name)).toMatchObject({ good: 0, inProduction: 12 });
    expect((await level("Bag")).good).toBe(50);
    expect((await stockMoves()).map((m) => m.kind)).toContain("OPENING");
  });

  it("adjustments: removals need a reason; damaged stock can be written off or repaired, not below zero", async () => {
    const bag = (await level("Bag")).id;
    await expect(adjustStock(prod, { stockItemId: bag, kind: "REMOVE", qty: 1, date: today })).rejects.toThrow(/why/);
    await adjustStock(prod, { stockItemId: bag, kind: "ADD", qty: 5, date: today });
    await adjustStock(prod, { stockItemId: bag, kind: "TO_DAMAGED", qty: 2, date: today });
    expect(await level("Bag")).toMatchObject({ good: 3, damaged: 2 });
    await expect(adjustStock(prod, { stockItemId: bag, kind: "WRITE_OFF", qty: 3, date: today })).rejects.toThrow(/Only 2 damaged/);
    await adjustStock(prod, { stockItemId: bag, kind: "REPAIRED", qty: 1, date: today });
    await adjustStock(prod, { stockItemId: bag, kind: "WRITE_OFF", qty: 1, date: today });
    expect(await level("Bag")).toMatchObject({ good: 4, damaged: 0 });
    await expect(adjustStock(ex, { stockItemId: bag, kind: "ADD", qty: 1, date: today })).rejects.toThrow(/production team/);
  });

  it("a cancelled order cancels a production order that hasn't started", async () => {
    const so = await order(5);
    await cancelSalesOrder(ex, so);
    expect((await productionOrders(prod, "all"))[0].status).toBe("CANCELLED");
  });
});

describe("marking production ready (R55)", () => {
  it("finishes in batches with an edited item list, then the rest in one go; undo puts everything back", async () => {
    await order(10);
    const [po] = await productionOrders(prod);
    const plan = await readyPlan(prod, po.id);
    expect(plan.lines[0]).toMatchObject({ ordered: 10, made: 0, left: 10 });
    expect(plan.items.find((i) => i.name === "Bag")?.qty).toBe(10);
    await expect(completeProduction(prod, po.id, { lines: [{ id: plan.lines[0].id, qty: 11 }] })).rejects.toThrow(/Only 10/);
    // First batch: 4 kits; 6 bags used (2 spoiled), diary as worked out.
    const items = plan.items.map((i) => ({ name: i.name, qty: i.name === "Bag" ? 6 : (i.qty / 10) * 4 }));
    await completeProduction(prod, po.id, { lines: [{ id: plan.lines[0].id, qty: 4 }], items, note: "first batch" });
    let [now] = await productionOrders(prod);
    expect(now).toMatchObject({ status: "IN_PRODUCTION", made: 4 });
    expect(await level(lkg.name)).toMatchObject({ good: 4, inProduction: 6 });
    expect(await level("Bag")).toMatchObject({ good: -6, needed: 6 });
    expect((await level("Diary")).good).toBe(-4);
    // "Everything is ready": the 6 left, items as listed.
    await setProductionStatus(prod, po.id, "READY");
    [now] = await productionOrders(prod, "all");
    expect(now).toMatchObject({ status: "READY", made: 10 });
    expect(await level("Bag")).toMatchObject({ good: -12, needed: 0 });
    expect((await level(lkg.name)).good).toBe(10);
    await expect(setProductionStatus(prod, po.id, "CANCELLED")).rejects.toThrow();
    await setProductionStatus(prod, po.id, "UNDO_READY");
    expect(await level("Bag")).toMatchObject({ good: 0, needed: 10 });
    expect(await level(lkg.name)).toMatchObject({ good: 0, inProduction: 10 });
  });
});
