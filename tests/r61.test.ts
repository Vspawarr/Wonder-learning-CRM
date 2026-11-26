// R61: full backup and restore (disaster recovery).
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { backupForAdmin, createBackup, readBackup, restoreBackup } from "@/server/backup";
import { createLead } from "@/server/leads";
import { leadData, makeUser, resetData } from "./helpers";

beforeEach(resetData);

async function snapshot() {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY 1`,
  );
  const out: Record<string, string> = {};
  for (const { name } of tables) {
    const [r] = await db.$queryRawUnsafe<{ j: string }[]>(`SELECT coalesce(json_agg(t ORDER BY t::text), '[]')::text AS j FROM "${name}" t`);
    out[name] = r.j;
  }
  return out;
}

describe("backup and restore", () => {
  it("restores every table exactly (files, dates, enums), and new numbers continue after the restored ones", async () => {
    const head = await makeUser("SALES_HEAD", "Viren Head");
    const rep = await makeUser("SALES_EXECUTIVE", "Asha Exec");
    const leadId = await createLead(head, leadData(rep.id, { schoolName: "Backup School", remarks: "with \"quotes\" and ünïcode ✓" } as never));
    await createLead(head, leadData(rep.id, { schoolName: "Second School" }));
    await db.schoolLogo.create({ data: { leadId, fileName: "logo.png", contentType: "image/png", size: 4, data: Buffer.from([0, 255, 10, 92]), uploadedById: head.id } });
    const before = await snapshot();
    const maxNumber = (await db.lead.aggregate({ _max: { number: true } }))._max.number!;
    // Push the client counter ahead (clients start at C-101): the restore must keep it, not reset it to 1.
    await db.$executeRawUnsafe(`SELECT setval('"Client_number_seq"', 500, true)`);

    const { file, head: info } = await createBackup(db);
    expect(info.counts.Lead).toBe(2);
    expect(readBackup(file).head.migrations.length).toBeGreaterThan(10);

    // An empty database refuses nothing; one with data needs wipe.
    await expect(restoreBackup(db, file)).rejects.toThrow(/already has data/);
    const r = await restoreBackup(db, file, { wipe: true });
    expect(r.counts.Lead).toBe(2);
    expect(await snapshot()).toEqual(before);
    const logo = await db.schoolLogo.findFirstOrThrow();
    expect([...logo.data]).toEqual([0, 255, 10, 92]);

    const next = await createLead(head, leadData(rep.id, { schoolName: "After Restore" }));
    expect((await db.lead.findUniqueOrThrow({ where: { id: next } })).number).toBe(maxNumber + 1);
    const [seq] = await db.$queryRawUnsafe<{ n: string }[]>(`SELECT nextval('"Client_number_seq"')::text AS n`);
    expect(seq.n).toBe("501");
  });

  it("restores into an empty database", async () => {
    const head = await makeUser("SALES_HEAD");
    await createLead(head, leadData(head.id));
    const before = await snapshot();
    const { file } = await createBackup(db);
    // A brand-new database: every table empty.
    const names = Object.keys(before).map((n) => `"${n}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
    await restoreBackup(db, file);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses other files and is for Admin / Director only", async () => {
    expect(() => readBackup(Buffer.from("hello"))).toThrow(/isn't a CRM backup/);
    await expect(backupForAdmin(db, await makeUser("SALES_HEAD"))).rejects.toThrow(/Only Admin or Director/);
  });
});
