// R57: the ID card designer: designs render safely with any school's details, the standalone file is current,
// and the school picker / saved logo respect who may see which school.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createLead } from "@/server/leads";
import { designSchoolLogo, designSchools } from "@/server/marketing";
import { DESIGN_KINDS } from "@/lib/designs/id-cards";
import { SAMPLE_CARD } from "@/lib/designs/sample";
import { leadData, makeUser, resetData } from "./helpers";

describe("ID card designs", () => {
  const kind = DESIGN_KINDS[0];
  it("has 8 designs that draw the school and student details", () => {
    expect(kind.designs).toHaveLength(8);
    for (const d of kind.designs) {
      const svg = d.render(SAMPLE_CARD);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).toContain(`viewBox="0 0 ${kind.width} ${kind.height}"`);
      expect(svg.toUpperCase()).toContain("SUNSHINE KIDS PRESCHOOL".split(" ")[0]);
      expect(svg).toContain("Aarav Sharma");
    }
  });

  it("escapes what is typed, works without logo / photo, and copes with long names", () => {
    const data = { ...SAMPLE_CARD, logo: null, photo: null, schoolName: 'St. Mary\'s <b>"Little Angels"</b> International Pre-Primary School & Day Care', studentName: "<script>x</script>" };
    for (const d of kind.designs) {
      const svg = d.render(data);
      expect(svg).not.toContain("<script>");
      expect(svg).not.toContain("<b>");
      expect(svg).toContain("&lt;script&gt;");
      expect(svg).not.toContain("undefined");
      expect(svg).not.toContain("NaN");
    }
  });

  it("the standalone designer files (ID cards, book covers) are built from the current designs", async () => {
    // @ts-expect-error plain JS build script
    const { designerHtml, TOOLS } = await import("../scripts/designer-html.mjs");
    for (const [tool, t] of Object.entries(TOOLS as Record<string, { out: string }>)) {
      const html = await designerHtml(tool);
      expect(readFileSync(t.out, "utf8") === html, `Run \`npm run designer:build\` and commit ${t.out}`).toBe(true);
    }
  }, 60000);
});

describe("designer school picker", () => {
  beforeEach(resetData);

  it("lists only the user's own leads and gives a saved logo only for a school they can see", async () => {
    const rep = await makeUser("SALES_EXECUTIVE");
    const other = await makeUser("SALES_EXECUTIVE");
    const head = await makeUser("SALES_HEAD");
    const mine = await createLead(rep, leadData(rep.id, { schoolName: "Mine School", address: "12 MG Road" }));
    const theirs = await createLead(other, leadData(other.id, { schoolName: "Their School" }));
    await db.schoolLogo.create({ data: { leadId: theirs, fileName: "l.png", contentType: "image/png", size: 3, data: Buffer.from([1, 2, 3]), uploadedById: other.id } });

    const list = await designSchools(rep);
    expect(list.map((s) => s.schoolName)).toEqual(["Mine School"]);
    expect(list[0]).toMatchObject({ key: `lead:${mine}`, schoolAddress: "12 MG Road" });
    expect((await designSchools(head)).length).toBe(2);

    expect(await designSchoolLogo(rep, `lead:${theirs}`)).toBeNull();
    expect(await designSchoolLogo(head, `lead:${theirs}`)).toBe("data:image/png;base64,AQID");
    expect(await designSchoolLogo(rep, `lead:${mine}`)).toBeNull();
    expect(await designSchoolLogo(rep, "user:x")).toBeNull();
  });
});
