// R61: full backup of the CRM's data, and putting it back into an empty database (disaster recovery).
//
// Works on the database tables themselves, so every table (today's and any added later) is included without a list
// to keep up to date: each table is read with Postgres' own JSON (files / logos / PO scans as hex), and written back
// with json_populate_recordset, which turns the JSON back into the exact column types. Tables are restored parents
// first (worked out from the foreign keys), then the auto-numbers (L-…, C-… and so on) are moved past the highest one.
import { Readable } from "stream";
import { createGzip, gunzipSync } from "zlib";
import type { Db } from "@/lib/db";
import { canManageSettings, type SessionUser } from "@/lib/permissions";
import { DomainError } from "./errors";

export const BACKUP_APP = "wonder-learning-crm";
export const BACKUP_VERSION = 1;
const SKIP = new Set(["_prisma_migrations"]);

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

async function tables(db: Db) {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((r) => r.name).filter((n) => !SKIP.has(n));
}

type Plan = { order: string[]; later: Map<string, string[]> };

/**
 * Parents before children, from the foreign keys. A table pointing at itself is fine (one INSERT holds all its rows).
 * Where tables point at each other (a client → its deal, a renewal deal → the client), the link that may be empty is
 * filled in after all rows are in (`later`).
 */
async function restorePlan(db: Db, names: string[]): Promise<Plan> {
  const fks = await db.$queryRawUnsafe<{ child: string; parent: string; cols: string[]; nullable: boolean }[]>(
    `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent,
            array_agg(a.attname::text) AS cols, bool_and(NOT a.attnotnull) AS nullable
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace
      GROUP BY c.oid, c.conrelid, c.confrelid`,
  );
  const unq = (s: string) => s.replace(/^"|"$/g, "");
  const edges = fks
    .map((f) => ({ child: unq(f.child), parent: unq(f.parent), cols: f.cols, nullable: f.nullable }))
    .filter((e) => e.child !== e.parent && names.includes(e.child) && names.includes(e.parent));
  const order: string[] = [];
  const later = new Map<string, string[]>();
  const done = new Set<string>();
  const broken = new Set<(typeof edges)[number]>();
  const blockers = (t: string) => edges.filter((e) => e.child === t && !done.has(e.parent) && !broken.has(e));
  while (order.length < names.length) {
    const ready = names.filter((n) => !done.has(n) && !blockers(n).length);
    if (ready.length) {
      for (const n of ready) {
        order.push(n);
        done.add(n);
      }
      continue;
    }
    // A loop: take a table whose remaining links may all be empty, and fill those links in afterwards.
    const t = names.find((n) => !done.has(n) && blockers(n).every((e) => e.nullable));
    if (!t) throw new Error(`Tables point at each other in a loop: ${names.filter((n) => !done.has(n)).join(", ")}`);
    for (const e of blockers(t)) {
      broken.add(e);
      later.set(t, [...(later.get(t) ?? []), ...e.cols]);
    }
  }
  return { order, later };
}

async function primaryKey(db: Db, table: string) {
  const rows = await db.$queryRawUnsafe<{ col: string }[]>(
    `SELECT a.attname::text AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'p' AND c.conrelid = $1::regclass`,
    q(table),
  );
  return rows.map((r) => r.col);
}

/** Where each auto-number (L-…, C-… and so on) will continue: the next value each counter gives. */
async function sequences(db: Db) {
  const rows = await db.$queryRawUnsafe<{ name: string; next: string }[]>(
    `SELECT sequencename AS name, (CASE WHEN last_value IS NULL THEN start_value ELSE last_value + increment_by END)::text AS next
       FROM pg_sequences WHERE schemaname = 'public'`,
  );
  return Object.fromEntries(rows.map((r) => [r.name, Number(r.next)]));
}

async function migrations(db: Db) {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT migration_name AS name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`,
  );
  return rows.map((r) => r.name);
}

/**
 * Everything in the database as one gzipped JSON file, made piece by piece (200 rows at a time) so a big database
 * (many uploaded files) neither fills the memory nor hits a download size limit: the file streams out as it is made.
 */
export async function backupStream(db: Db) {
  const names = await tables(db);
  const counts: Record<string, number> = {};
  for (const name of names) {
    const [r] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM ${q(name)}`);
    counts[name] = r.n;
  }
  const head: BackupHead = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    migrations: await migrations(db),
    counts,
    sequences: await sequences(db),
  };
  async function* json() {
    yield `{"head":${JSON.stringify(head)},"tables":{`;
    for (const [i, name] of names.entries()) {
      yield `${i ? "," : ""}${JSON.stringify(name)}:[`;
      for (let off = 0; off < counts[name]; off += 200) {
        // Rows as Postgres' own JSON, kept as text (no re-parsing of big files).
        const rows = await db.$queryRawUnsafe<{ j: string }[]>(`SELECT row_to_json(t)::text AS j FROM ${q(name)} t ORDER BY t.ctid LIMIT 200 OFFSET ${off}`);
        yield (off ? "," : "") + rows.map((r) => r.j).join(",");
      }
      yield "]";
    }
    yield "}}";
  }
  const gz = createGzip({ level: 6 });
  const src = Readable.from(json(), { objectMode: false });
  src.on("error", (e) => gz.destroy(e));
  src.pipe(gz);
  return { head, stream: gz };
}

/** The whole backup in memory (tests, and the backup script). */
export async function createBackup(db: Db) {
  const { head, stream } = await backupStream(db);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return { file: Buffer.concat(chunks), head };
}

export async function backupForAdmin(db: Db, user: SessionUser) {
  if (!canManageSettings(user.role)) throw new DomainError("Only Admin or Director can download a backup.");
  return backupStream(db);
}

export type BackupHead = {
  app: string;
  version: number;
  createdAt: string;
  migrations: string[];
  counts: Record<string, number>;
  /** Next value of each counter, so numbering continues exactly (clients start at C-101, not at 1). */
  sequences?: Record<string, number>;
};

export function readBackup(file: Buffer): { head: BackupHead; tables: Record<string, unknown[]> } {
  let data: { head?: BackupHead; tables?: Record<string, unknown[]> };
  try {
    data = JSON.parse(gunzipSync(file).toString("utf8"));
  } catch {
    throw new DomainError("This isn't a CRM backup file (it couldn't be read).");
  }
  if (data.head?.app !== BACKUP_APP || !data.tables) throw new DomainError("This isn't a Wonder Learning CRM backup file.");
  if (data.head.version > BACKUP_VERSION) throw new DomainError("This backup was made by a newer version of the CRM. Update the code first.");
  return { head: data.head, tables: data.tables };
}

/**
 * Puts a backup into this database. The database must already have the CRM's tables (`prisma migrate deploy`) and at
 * least every update the backup was made with. Refuses a database that already has data unless `wipe` is set (then it
 * empties every table first, e.g. the starting users a fresh deployment creates).
 */
export async function restoreBackup(db: Db, file: Buffer, o: { wipe?: boolean } = {}) {
  const { head, tables: data } = readBackup(file);
  const have = new Set(await migrations(db));
  const missing = head.migrations.filter((m) => !have.has(m));
  if (missing.length) throw new DomainError(`This database is missing ${missing.length} update(s) the backup needs. Run "npx prisma migrate deploy" first.`);

  const names = await tables(db);
  const unknown = Object.keys(data).filter((t) => !names.includes(t));
  if (unknown.length) throw new DomainError(`The database has no table for: ${unknown.join(", ")}.`);
  const { order, later } = await restorePlan(db, names);

  const filled: string[] = [];
  for (const t of names) {
    const [r] = await db.$queryRawUnsafe<{ any: boolean }[]>(`SELECT EXISTS (SELECT 1 FROM ${q(t)}) AS any`);
    if (r.any) filled.push(t);
  }
  if (filled.length && !o.wipe) throw new DomainError(`This database already has data (${filled.slice(0, 5).join(", ")}…). Use an empty database, or wipe it first.`);

  const counts: Record<string, number> = {};
  const run = async (tx: Db) => {
    if (filled.length) await tx.$executeRawUnsafe(`TRUNCATE ${names.map(q).join(", ")} CASCADE`);
    const chunks = (rows: unknown[]) => Array.from({ length: Math.ceil(rows.length / 500) }, (_, i) => rows.slice(i * 500, i * 500 + 500));
    for (const t of order) {
      const rows = (data[t] ?? []) as Record<string, unknown>[];
      counts[t] = rows.length;
      const empty = later.get(t) ?? [];
      const first = empty.length ? rows.map((r) => ({ ...r, ...Object.fromEntries(empty.map((c) => [c, null])) })) : rows;
      for (const part of chunks(first))
        await tx.$executeRawUnsafe(`INSERT INTO ${q(t)} SELECT * FROM json_populate_recordset(NULL::${q(t)}, $1::json)`, JSON.stringify(part));
    }
    // The links left empty above, now that every row is in.
    for (const [t, cols] of later) {
      const pk = await primaryKey(tx, t);
      const rows = ((data[t] ?? []) as Record<string, unknown>[]).filter((r) => cols.some((c) => r[c] != null));
      for (const part of chunks(rows))
        await tx.$executeRawUnsafe(
          `UPDATE ${q(t)} AS t SET ${cols.map((c) => `${q(c)} = v.${q(c)}`).join(", ")}
             FROM json_populate_recordset(NULL::${q(t)}, $1::json) AS v WHERE ${pk.map((c) => `t.${q(c)} = v.${q(c)}`).join(" AND ")}`,
          JSON.stringify(part),
        );
    }
    // Auto-numbers continue exactly where the backup's did (never below the highest restored number, nor below where
    // this database's counter already is, e.g. clients starting at C-101).
    const seqs = await tx.$queryRawUnsafe<{ t: string; c: string; s: string }[]>(
      `SELECT table_name AS t, column_name AS c, pg_get_serial_sequence(quote_ident(table_name), column_name) AS s
         FROM information_schema.columns WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`,
    );
    const here = await sequences(tx);
    for (const s of seqs) {
      if (!s.s) continue;
      const name = s.s.replace(/^public\./, "").replace(/"/g, "");
      const saved = head.sequences?.[name] ?? 0;
      await tx.$executeRawUnsafe(
        `SELECT setval('${s.s}', greatest(coalesce((SELECT max(${q(s.c)}) FROM ${q(s.t)}), 0) + 1, ${Math.trunc(saved)}, ${Math.trunc(here[name] ?? 1)}), false)`,
      );
    }
  };
  if ("$transaction" in db) await db.$transaction(run, { timeout: 10 * 60_000, maxWait: 60_000 });
  else await run(db);
  return { head, counts };
}
