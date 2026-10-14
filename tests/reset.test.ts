import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { todayIST } from "@/lib/dates";
import { createLead, convertLead } from "@/server/leads";
import { createExpense } from "@/server/expenses";
import { createEntry, saveAccount } from "@/server/company";
import { clearTestData, testDataCounts } from "@/server/reset";
import { leadData, makeProduct, makeUser, resetData } from "./helpers";

beforeEach(async () => {
  await resetData();
});

describe("clear test data (R23, R43)", () => {
  it("empties typed-in data, keeps logins and set-up, restarts numbering", async () => {
    const admin = await makeUser("ADMIN");
    const exec = await makeUser("SALES_EXECUTIVE");
    await makeProduct("Curriculum", 1000);
    await db.appSetting.upsert({ where: { key: "test.template" }, update: { value: { a: 1 } }, create: { key: "test.template", value: { a: 1 } } });
    const lead = await createLead(admin, leadData(exec.id));
    await convertLead(admin, lead, { temperature: "HOT" });
    await createExpense(exec, { date: todayIST(), category: "Local travel / fuel", amount: 500, description: "Bus to Nashik", paidBy: "OWN", billAvailable: "no", noBillReason: "Ticket lost on the way" }, []);
    await saveAccount(admin, null, { name: "HDFC", kind: "BANK", openingBalance: 1000, openingDate: todayIST() });
    await createEntry(admin, { date: todayIST(), direction: "IN", category: "Interest", amount: 10 });
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
    const e = await createExpense(exec, { date: todayIST(), category: "Local travel / fuel", amount: 100, description: "Auto", paidBy: "OWN", billAvailable: "no", noBillReason: "No receipt given" }, []);
    expect(e.number).toBe(1);
  });
});
