// R48: delete a city, the PO template's selected kits / unticked items, and private document links.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { deleteCity } from "@/server/settings";
import { poPages } from "@/server/finance/po";
import { readShareToken, shareToken } from "@/server/share-links";
import { makeUser, resetData } from "./helpers";

beforeEach(resetData);

describe("Settings → Locations", () => {
  it("an admin can delete a city; others can't", async () => {
    const admin = await makeUser("ADMIN");
    const exec = await makeUser("SALES_EXECUTIVE");
    await db.state.upsert({ where: { name: "Goa" }, create: { name: "Goa" }, update: {} });
    const city = await db.city.create({ data: { stateName: "Goa", name: "Panaji" } });
    await expect(deleteCity(exec, city.id)).rejects.toThrow();
    await deleteCity(admin, city.id);
    expect(await db.city.count({ where: { id: city.id } })).toBe(0);
  });
});

const kit = (name: string, groups: Record<string, string[]>) => ({
  kit: { name, color: "#000000", contents: Object.entries(groups).map(([title, items]) => ({ title, items })) },
  removed: [] as string[],
});

describe("PO template pages from page 2", () => {
  const lines = [kit("Nursery Kit", { Books: ["Book 1", "Book 2"], Essentials: ["Bag", "Diary"] }), null, kit("LKG Kit", { Books: ["Book A"] })];

  it("prints every kit while no quantity is filled in", () => {
    const r = poPages(lines, { kits: [], pages: [] });
    expect(r.checklist.map((k) => k.name)).toEqual(["Nursery Kit", "LKG Kit"]);
    expect(r.exclude).toEqual([]);
  });

  it("prints only the kits with a quantity by default", () => {
    const r = poPages(lines, { kits: [null, 5, 20], pages: [] });
    expect(r.checklist.map((k) => k.name)).toEqual(["LKG Kit"]);
  });

  it("follows the ticks: unselected kits left out, unticked items dropped and listed as excluded", () => {
    const withRemoved = [{ ...lines[0]!, removed: ["Shape kit"] }, null, lines[2]];
    const r = poPages(withRemoved, { kits: [10, null, 20], pages: [{ on: true, off: ["Bag", "Book 2"] }, null, { on: false, off: [] }] });
    expect(r.checklist).toEqual([{ name: "Nursery Kit", color: "#000000", contents: [{ title: "Books", items: ["Book 1"] }, { title: "Essentials", items: ["Diary"] }] }]);
    expect(r.exclude).toEqual(["Nursery Kit: Shape kit, Book 2, Bag"]);
  });
});

describe("private document links", () => {
  it("opens only the document it was made for", () => {
    const t = shareToken("challan", "cmabc1234567890");
    expect(readShareToken(t)).toEqual({ kind: "challan", id: "cmabc1234567890" });
    expect(readShareToken(t.replace(/^c/, "p"))).toBeNull();
    expect(readShareToken(t.replace("cmabc", "cmabd"))).toBeNull();
    expect(readShareToken("nonsense")).toBeNull();
  });
});
