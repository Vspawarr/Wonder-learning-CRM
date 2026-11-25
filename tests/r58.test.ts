// R58: Wonder Learning book covers with the school's logo and address (Marketing → Tools).
import { existsSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COVER_KINDS, UKG_COVERS } from "@/lib/designs/book-covers";
import { SAMPLE_CARD } from "@/lib/designs/sample";

describe("UKG book covers", () => {
  it("has the 9 books, each with its cleaned picture in public/", () => {
    expect(COVER_KINDS).toContain(UKG_COVERS);
    expect(UKG_COVERS.designs).toHaveLength(9);
    expect(UKG_COVERS.student).toBe(false);
    for (const d of UKG_COVERS.designs) {
      const file = `public${UKG_COVERS.assets![d.id]}`;
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeLessThan(600_000);
    }
  });

  it("draws the cover picture with the school's name, address and phone, safely", () => {
    const data = { ...SAMPLE_CARD, schoolName: "Floria <Preschool>", schoolAddress: "Plot 21, Lane 4, Koregaon Park, Pune, Maharashtra 411001 & more", schoolPhone: "98220 45678" };
    const d = UKG_COVERS.designs[0];
    const svg = d.render(data, { [d.id]: "data:image/jpeg;base64,AAAA" });
    expect(svg).toContain('href="data:image/jpeg;base64,AAAA"');
    expect(svg).toContain("Floria &lt;Preschool&gt;");
    expect(svg).toContain("FLORIA &lt;PRESCHOOL&gt;");
    expect(svg).toContain("98220 45678");
    expect(svg).toContain("&amp; more");
    expect(svg).not.toContain("<Preschool>");
    expect(svg).not.toMatch(/undefined|NaN/);
    // No logo: initials instead; no address / phone: nothing drawn for them.
    const bare = d.render({ ...data, logo: null, schoolAddress: "", schoolPhone: "" });
    expect(bare).not.toContain("Address");
    expect(bare).not.toMatch(/undefined|NaN/);
  });
});
