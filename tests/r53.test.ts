// R53: overall outstanding by school, for the finance dashboard pie.
import { describe, expect, it } from "vitest";
import { outstandingByClient, type InvoiceRow } from "@/server/finance/service";

const row = (id: string, balance: number, state = "UNPAID") =>
  ({ client: { id, schoolName: `School ${id}` }, balance, state }) as unknown as InvoiceRow;

describe("outstanding by school", () => {
  it("adds up each school's open invoices, biggest first, with % shares", () => {
    const r = outstandingByClient([row("a", 300), row("b", 500), row("a", 200), row("c", 0, "PAID"), row("d", 900, "CANCELLED")]);
    expect(r.total).toBe(1000);
    expect(r.schools).toBe(2);
    expect(r.slices.map((s) => [s.name, s.amount, s.pct])).toEqual([
      ["School a", 500, 50],
      ["School b", 500, 50],
    ]);
  });

  it("groups the smaller schools as Others", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(String(i), (10 - i) * 100));
    const r = outstandingByClient(rows, 3);
    expect(r.slices).toHaveLength(4);
    expect(r.slices[3]).toMatchObject({ id: null, name: "Others (7 schools)", amount: 2800, clients: 7 });
    expect(r.slices.reduce((t, s) => t + s.pct, 0)).toBeCloseTo(100, 0);
  });
});
