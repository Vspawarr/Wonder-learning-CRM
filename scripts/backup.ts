// R61: makes a full backup from the command line (same file as Settings → Backup), e.g. straight from the live database
// when the website itself is down:  npx tsx --env-file=.env scripts/backup.ts [folder]
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "../src/lib/db";
import { createBackup } from "../src/server/backup";

async function main() {
  const { file, head } = await createBackup(db);
  const out = join(process.argv[2] ?? ".", `wonder-crm-backup-${head.createdAt.slice(0, 16).replace(/[:T]/g, "-")}.json.gz`);
  writeFileSync(out, file);
  console.log(`Saved ${out} (${Math.round(file.length / 1024)} KB): ${head.counts.Lead ?? 0} leads, ${head.counts.Client ?? 0} clients.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await db.$disconnect();
  process.exit(1);
});
