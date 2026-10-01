// Monthly sales (invoiced) and collection targets per salesperson, and how far each has got.
import { z } from "zod";
import { db } from "@/lib/db";
import { todayIST, toDbDate } from "@/lib/dates";
import { SALES_ROLES, seesAllSales, type SessionUser } from "@/lib/permissions";
import { DomainError } from "./errors";
import { COUNTED_STATUSES, r2 } from "./finance/money";
import { parse } from "./validation";

export const thisMonth = () => todayIST().slice(0, 7);
const isMonth = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { gte: toDbDate(`${month}-01`), lt: toDbDate(next) };
}

const amount = z
  .union([z.number(), z.string()])
  .transform((v) => (v === "" ? 0 : Number(String(v).replace(/,/g, ""))))
  .refine((n) => Number.isFinite(n) && n >= 0 && n < 1e12, "Enter a valid amount.");
const targetsInput = z.array(z.object({ userId: z.string().min(1), sales: amount, collection: amount })).max(200);

export async function saveTargets(user: SessionUser, month: string, raw: unknown) {
  if (!seesAllSales(user.role)) throw new DomainError("Only an Admin or the Sales Head can set targets.");
  if (!isMonth(month)) throw new DomainError("Choose a month.");
  const rows = parse(targetsInput, raw);
  await db.$transaction(
    rows.map((r) =>
      db.target.upsert({
        where: { userId_month: { userId: r.userId, month } },
        create: {
          userId: r.userId,
          month,
          sales: r.sales,
          collection: r.collection,
        },
        update: { sales: r.sales, collection: r.collection },
      }),
    ),
  );
}

/** Each salesperson's targets and achievement for a month (just their own row for others). */
export async function targetProgress(user: SessionUser, month: string = thisMonth()) {
  if (!isMonth(month)) month = thisMonth();
  const range = monthRange(month);
  const people = await db.user.findMany({
    where: seesAllSales(user.role) ? { active: true, role: { in: [...SALES_ROLES] } } : { id: user.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const ids = people.map((p) => p.id);
  const [targets, invoiced, collected] = await Promise.all([
    db.target.findMany({ where: { month, userId: { in: ids } } }),
    db.invoice.findMany({
      where: {
        status: "ISSUED",
        date: range,
        client: { ownerId: { in: ids } },
      },
      select: { total: true, client: { select: { ownerId: true } } },
    }),
    db.payment.findMany({
      where: {
        status: { in: [...COUNTED_STATUSES] },
        date: range,
        client: { ownerId: { in: ids } },
      },
      select: { amount: true, client: { select: { ownerId: true } } },
    }),
  ]);
  const sum = (rows: { client: { ownerId: string } }[], id: string, f: (r: never) => number) =>
    r2(rows.filter((r) => r.client.ownerId === id).reduce((t, r) => t + f(r as never), 0));
  return {
    month,
    rows: people.map((p) => {
      const t = targets.find((x) => x.userId === p.id);
      return {
        userId: p.id,
        name: p.name,
        salesTarget: t ? Number(t.sales) : 0,
        collectionTarget: t ? Number(t.collection) : 0,
        sales: sum(invoiced, p.id, (r: { total: unknown }) => Number(r.total)),
        collection: sum(collected, p.id, (r: { amount: unknown }) => Number(r.amount)),
      };
    }),
  };
}
