// R61: puts a full backup (Settings → Backup) into a database: the disaster-recovery step in docs/DISASTER_RECOVERY.md.
//
//   1. DATABASE_URL (in .env, or in the shell) points at the NEW database.
//   2. npx prisma migrate deploy                        (creates the empty tables)
//   3. npx tsx --env-file=.env scripts/restore-backup.ts wonder-crm-backup-….json.gz [--wipe]
//
// --wipe empties the database first (needed when a deployment has already created the starting users / settings).
import { readFileSync } from "node:fs";
import { db } from "../src/lib/db";
import { readBackup, restoreBackup } from "../src/server/backup";

async function main() {
  const file = process.argv[2];
  const wipe = process.argv.includes("--wipe");
  if (!file || !process.env.DATABASE_URL) {
    console.log("Usage: npx tsx --env-file=.env scripts/restore-backup.ts <backup.json.gz> [--wipe]   (DATABASE_URL = the new database)");
    process.exit(1);
  }
  const buf = readFileSync(file);
  const { head } = readBackup(buf);
  const host = new URL(process.env.DATABASE_URL).host;
  console.log(`Backup of ${head.createdAt}: ${head.counts.Lead ?? 0} leads, ${head.counts.Client ?? 0} clients, ${head.counts.Invoice ?? 0} invoices.`);
  console.log(`Restoring into database at ${host}${wipe ? " (emptying it first)" : ""}…`);
  const r = await restoreBackup(db, buf, { wipe });
  const total = Object.values(r.counts).reduce((a, b) => a + b, 0);
  console.log(`Done: ${total} rows in ${Object.keys(r.counts).length} tables.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await db.$disconnect();
  process.exit(1);
});
