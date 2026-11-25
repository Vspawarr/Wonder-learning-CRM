import { notFound } from "next/navigation";
import { ExportButtons } from "@/components/export-buttons";
import { Kpi, PageHeader } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import { canManageInventory, isProductionOnly } from "@/lib/permissions";
import { inventoryOn, productionOrders, stockLevels, stockMoves } from "@/server/inventory";
import { requireUser } from "@/server/session";
import { MovesTab, ProductionTab, StockTab } from "./inventory-client";

export const metadata = { title: "Inventory & production" };

// R54: stock of kits and their items, production orders from received POs, and every stock movement.
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ tab?: string; show?: string; pshow?: string; item?: string; kind?: string }> }) {
  const user = await requireUser();
  if (!(await inventoryOn())) notFound();
  const sp = await searchParams;
  const [levels, orders, moves] = await Promise.all([stockLevels(), productionOrders(user, sp.pshow), stockMoves({ item: sp.item, kind: sp.kind })]);
  const manage = canManageInventory(user.role);
  const open = orders.filter((o) => o.status === "PLANNED" || o.status === "IN_PRODUCTION");
  const short = levels.filter((l) => l.state === "SHORT").length;
  const low = levels.filter((l) => l.state === "LOW").length;
  return (
    <>
      <PageHeader
        title="Inventory & production"
        sub={
          isProductionOnly(user.role)
            ? "Production orders to make and the stock of every kit and item."
            : "Stock of every kit and item, production orders made from received POs, and every movement in and out."
        }
      />
      <div className="kgrid kgrid-2 mb-4">
        <Kpi label="Production orders open" value={open.length} sub={`${open.reduce((t, o) => t + o.kits, 0)} kits to make`} color="#6C2D91" href="/inventory?tab=production" />
        <Kpi label="Short" value={short} sub="Free stock below zero" color="#E3262C" href="/inventory?tab=stock&show=alert" />
        <Kpi label="Low" value={low} sub="At or below the reorder level" color="#F28C1E" href="/inventory?tab=stock&show=alert" />
        <Kpi label="Finished kits in stock" value={levels.filter((l) => l.kind === "KIT").reduce((t, l) => t + Math.max(0, l.good), 0)} sub="Ready to dispatch" color="#6CB33F" href="/inventory?tab=stock&show=kits" />
      </div>
      <Tabs
        tabs={[
          {
            id: "production",
            label: "Production orders",
            count: open.length,
            panel: (
              <>
                <div className="mb-3 flex justify-end">
                  <ExportButtons report="production" />
                </div>
                <ProductionTab orders={orders} manage={manage} />
              </>
            ),
          },
          {
            id: "stock",
            label: "Stock",
            count: short || undefined,
            panel: (
              <>
                <div className="mb-3 flex justify-end">
                  <ExportButtons report="stock" />
                </div>
                <StockTab levels={levels} manage={manage} />
              </>
            ),
          },
          {
            id: "moves",
            label: "Movements",
            panel: (
              <>
                <div className="mb-3 flex justify-end">
                  <ExportButtons report="stockmoves" />
                </div>
                <MovesTab moves={moves} items={levels.map((l) => ({ id: l.id, name: l.name }))} />
              </>
            ),
          },
        ]}
      />
    </>
  );
}
