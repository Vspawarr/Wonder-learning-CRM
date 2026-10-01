import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createLead, convertLead } from "@/server/leads";
import { clearTestData, testDataCounts } from "@/server/reset";
import { leadData, makeProduct, makeUser, resetData } from "./helpers";

beforeEach(async () => {
  await resetData();
});

describe("clear test data", () => {
  it("empties typed-in data, keeps logins and set-up, restarts numbering", async () => {
    const admin = await makeUser("ADMIN");
    const exec = await makeUser("SALES_EXECUTIVE");
    await makeProduct("Curriculum", 1000);
    await db.appSetting.upsert({ where: { key: "test.template" }, update: { value: { a: 1 } }, create: { key: "test.template", value: { a: 1 } } });
    const lead = await createLead(admin, leadData(exec.id));
    await convertLead(admin, lead, { temperature: "HOT" });
    expect((await testDataCounts()).leads).toBe(1);

    await expect(clearTestData(exec, "CLEAR")).rejects.toThrow(/Admin or Director/);
    await expect(clearTestData(admin, "yes")).rejects.toThrow(/Type CLEAR/);
    await clearTestData(admin, "clear");

    expect(Object.values(await testDataCounts()).every((n) => n === 0)).toBe(true);
    expect(await db.user.count()).toBe(2);
    expect(await db.product.count()).toBe(1);
    expect(await db.city.count()).toBe(1);
    expect(await db.appSetting.findUnique({ where: { key: "test.template" } })).not.toBeNull();

    const again = await createLead(admin, leadData(exec.id));
    expect((await db.lead.findUniqueOrThrow({ where: { id: again } })).number).toBe(1001);
  });
});
