// R49: quotation page 2 lists only the quoted kits, packed onto pages.
import { describe, expect, it } from "vitest";
import { CLASS_KITS, kitSections } from "@/lib/kits";
import { kitPages } from "@/server/quotation/pdf";

const kit = (i: number) => ({ name: CLASS_KITS[i].name, color: CLASS_KITS[i].color, contents: kitSections(CLASS_KITS[i]) });

describe("quotation page 2", () => {
  it("prints only the given kits, two per page, then the other lines", () => {
    const pages = kitPages([kit(0), kit(1), kit(2)], ["HINDI -Swar"]);
    expect(pages.map((p) => p.map((b) => (b.kind === "kit" ? b.name : "others")))).toEqual([
      ["Play Group Kit", "Nursery Kit"],
      ["LKG Kit", "others"],
    ]);
  });

  it("keeps every group of a kit, split over two columns", () => {
    const [[b]] = kitPages([kit(2)], []);
    if (b.kind !== "kit") throw new Error("expected a kit");
    expect([...b.left, ...b.right].map((g) => g.title)).toEqual(kitSections(CLASS_KITS[2]).map((g) => g.title));
    expect(b.left.length && b.right.length).toBeTruthy();
  });
});
