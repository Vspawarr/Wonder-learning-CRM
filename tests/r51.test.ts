// R51: the school's logo, kept for the school and printed on its PO template.
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { convertToClient } from "@/server/clients";
import { convertLead, createLead } from "@/server/leads";
import { moveOpportunity } from "@/server/opportunities";
import { createQuotation, markQuotationSent } from "@/server/quotation/service";
import { logoForQuotation, removeSchoolLogo, saveSchoolLogo, schoolLogo } from "@/server/school-logo";
import { poTemplatePdf } from "@/server/finance/po";
import { leadData, makeUser, resetData } from "./helpers";

beforeEach(resetData);

// A 1×1 PNG.
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));
const quote = { date: todayIST(), validityDays: 3, toLine: "The Director", schoolName: "Logo School", items: [{ description: "LKG Kit", mrp: 4000, price: 3000 }] };

describe("school logo", () => {
  it("is kept for the school: uploaded on the deal's quotation, used for the client's later ones", async () => {
    const ex = await makeUser("SALES_EXECUTIVE");
    const other = await makeUser("SALES_EXECUTIVE");
    const oppId = await convertLead(ex, await createLead(ex, leadData(ex.id, { schoolName: "Logo School" })), { temperature: "WARM" });
    const q1 = await createQuotation(ex, { opportunityId: oppId }, quote);
    await expect(saveSchoolLogo(ex, q1, { name: "logo.gif", type: "image/gif", bytes: PNG })).rejects.toThrow(/PNG or JPG/);
    await expect(saveSchoolLogo(other, q1, { name: "logo.png", type: "image/png", bytes: PNG })).rejects.toThrow(/not found/i);
    await saveSchoolLogo(ex, q1, { name: "logo.png", type: "image/png", bytes: PNG });
    expect((await schoolLogo(ex, q1)).fileName).toBe("logo.png");

    await moveOpportunity(ex, oppId, { stage: "WON" });
    const clientId = await convertToClient(ex, oppId);
    const q2 = await createQuotation(ex, { clientId }, quote);
    expect(await logoForQuotation(await db.quotation.findUniqueOrThrow({ where: { id: q2 } }))).toMatchObject({ format: "png" });

    // Replacing it from the client's quotation keeps one logo for the school.
    await saveSchoolLogo(ex, q2, { name: "new.png", type: "image/png", bytes: PNG });
    expect(await db.schoolLogo.count()).toBe(1);
    expect((await schoolLogo(ex, q1)).fileName).toBe("new.png");

    await markQuotationSent(ex, q2, "download");
    expect((await poTemplatePdf(ex, q2)).pdf.subarray(0, 4).toString()).toBe("%PDF");

    await removeSchoolLogo(ex, q1);
    expect(await logoForQuotation(await db.quotation.findUniqueOrThrow({ where: { id: q2 } }))).toBeNull();
  });
});
