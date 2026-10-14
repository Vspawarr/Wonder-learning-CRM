import { canApprovePayments, canManageCompanyAccounts } from "@/lib/permissions";
import { db } from "@/lib/db";
import { clientCode, leadCode, oppCode, STAGE_LABEL } from "@/lib/constants";
import { toDbDate, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { clientScope, leadScope, oppScope, taskScope } from "./access";
import { invoiceRows } from "./finance/service";
import { renewalCandidates } from "./renewals";
import { getFeatures } from "./features";
import { canApproveExpenses } from "./expenses";
import { billsDueSoon, pendingSpend } from "./company";
import { pendingTransferCount } from "./transfers";

// Read-only helpers for the top bar: search everything, and "needs attention" alerts.
// Both go through the same scope rules as the screens they link to.

export type SearchHit = { kind: "Lead" | "Opportunity" | "Client" | "Invoice"; title: string; sub: string; href: string };

export async function globalSearch(user: SessionUser, raw: string): Promise<SearchHit[]> {
  const q = raw.trim();
  if (q.length < 2) return [];
  const has = { contains: q, mode: "insensitive" as const };
  const digits = q.replace(/\D/g, "");
  const num = /^[a-z]-?\d+$/i.test(q) || /^\d+$/.test(q) ? Number(q.replace(/\D/g, "")) : null;
  const [leads, opps, clients, invoices] = await Promise.all([
    db.lead.findMany({
      where: {
        ...leadScope(user),
        OR: [
          { schoolName: has },
          { contactName: has },
          { city: has },
          ...(digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
          ...(num ? [{ number: num }] : []),
        ],
      },
      select: { id: true, number: true, schoolName: true, contactName: true, city: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    db.opportunity.findMany({
      where: { ...oppScope(user), OR: [{ schoolName: has }, ...(num ? [{ number: num }] : [])] },
      select: { id: true, number: true, schoolName: true, stage: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    db.client.findMany({
      where: {
        ...clientScope(user),
        OR: [
          { schoolName: has },
          { contactName: has },
          { city: has },
          ...(digits.length >= 4 ? [{ mobile: { contains: digits } }] : []),
          ...(num ? [{ number: num }] : []),
        ],
      },
      select: { id: true, number: true, schoolName: true, contactName: true, city: true },
      orderBy: { schoolName: "asc" },
      take: 5,
    }),
    db.invoice.findMany({
      where: { number: has, client: { is: clientScope(user) } },
      select: { number: true, clientId: true, client: { select: { schoolName: true } } },
      orderBy: { date: "desc" },
      take: 5,
    }),
  ]);
  return [
    ...clients.map((c) => ({ kind: "Client" as const, title: c.schoolName, sub: `${clientCode(c.number)} · ${c.contactName} · ${c.city}`, href: `/clients/${c.id}` })),
    ...leads.map((l) => ({ kind: "Lead" as const, title: l.schoolName, sub: `${leadCode(l.number)} · ${l.contactName} · ${l.city}`, href: `/leads/${l.id}` })),
    ...opps.map((o) => ({
      kind: "Opportunity" as const,
      title: o.schoolName,
      sub: `${oppCode(o.number)} · ${STAGE_LABEL[o.stage]}`,
      href: `/opportunities?opp=${o.id}`,
    })),
    ...invoices.map((i) => ({ kind: "Invoice" as const, title: i.number, sub: i.client.schoolName, href: `/clients/${i.clientId}` })),
  ];
}

export type Alert = {
  tone: "bad" | "warn" | "info";
  icon: "check" | "rupee" | "refresh" | "doc" | "bell";
  text: string;
  href: string;
  /** Stable id for read / unread (R45). It changes when the content changes, so new things show as unread. */
  key: string;
  read?: boolean;
  /** A to-do starting within 15 minutes (R45). */
  reminder?: boolean;
};

/** "HH:MM" now, India time. */
const nowHM = (d = new Date()) => new Date(d.getTime() + 5.5 * 3600e3).toISOString().slice(11, 16);
const minutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const time12 = (hm: string) => {
  const h = Number(hm.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${hm.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
};

/** R45: the person's to-dos that start within the next 15 minutes. */
export async function upcomingReminders(user: SessionUser, at = new Date()): Promise<Alert[]> {
  const now = minutes(nowHM(at));
  const rows = await db.task.findMany({
    where: { assigneeId: user.id, status: "OPEN", dueDate: toDbDate(todayIST(at)), dueTime: { not: null } },
    select: { id: true, title: true, dueTime: true },
  });
  return rows
    .filter((t) => {
      const m = minutes(t.dueTime!);
      return m >= now && m - now <= 15;
    })
    .sort((a, b) => a.dueTime!.localeCompare(b.dueTime!))
    .map((t) => {
      const left = minutes(t.dueTime!) - now;
      return {
        tone: "warn" as const,
        icon: "bell" as const,
        text: `${left ? `In ${left} min` : "Now"}: ${t.title} (${time12(t.dueTime!)})`,
        href: "/tasks",
        key: `reminder:${t.id}:${t.dueTime}`,
        reminder: true,
      };
    });
}

/** Mark notifications read (or unread again) for this person (R45). */
export async function markAlerts(user: SessionUser, keys: string[], read: boolean) {
  const list = [...new Set(keys)].filter((k) => typeof k === "string" && k.length <= 200).slice(0, 100);
  if (!list.length) return;
  if (read) await db.notificationRead.createMany({ data: list.map((key) => ({ userId: user.id, key })), skipDuplicates: true });
  else await db.notificationRead.deleteMany({ where: { userId: user.id, key: { in: list } } });
  // Old marks are no longer needed.
  await db.notificationRead.deleteMany({ where: { userId: user.id, readAt: { lt: new Date(Date.now() - 90 * 86400e3) } } });
}

export async function attentionAlerts(user: SessionUser): Promise<Alert[]> {
  const today = toDbDate(todayIST());
  const [overdueTasks, todayTasks, invoices, cheques, renewals, approvals, expenses, spend, transfers] = await Promise.all([
    db.task.count({ where: { ...taskScope(user), assigneeId: user.id, status: "OPEN", dueDate: { lt: today } } }),
    db.task.count({ where: { ...taskScope(user), assigneeId: user.id, status: "OPEN", dueDate: today } }),
    invoiceRows(user, { status: { not: "CANCELLED" } }),
    db.payment.count({ where: { status: "IN_HAND", approval: "APPROVED", OR: [{ invoice: { client: clientScope(user) } }, { salesOrder: { client: clientScope(user) } }] } }),
    getFeatures().then((f) => (f.renewals ? renewalCandidates(user).then((r) => r.clients.length) : 0)),
    canApprovePayments(user.role) ? db.payment.count({ where: { approval: "PENDING" } }) : 0,
    canApproveExpenses(user).then(async (ok) => (ok && (await getFeatures()).expenses ? db.expense.count({ where: { status: "SUBMITTED" } }) : 0)),
    getFeatures().then(async (f) =>
      f.companyAccounts && canManageCompanyAccounts(user.role)
        ? { ...((await canApproveExpenses(user)) ? await pendingSpend() : { bills: 0, salaries: 0, entries: 0 }), due: await billsDueSoon() }
        : { bills: 0, salaries: 0, entries: 0, due: 0 },
    ),
    getFeatures().then((f) => (f.transfers ? pendingTransferCount(user) : 0)),
  ]);
  const reminders = await upcomingReminders(user);
  const overdue = invoices.filter((i) => i.state === "OVERDUE");
  const day = todayIST();
  // Reminders for to-dos starting in the next 15 minutes come first (R45).
  const a: Alert[] = [...reminders];
  if (approvals) a.push({ key: `approvals:${approvals}`, tone: "warn", icon: "rupee", text: `${approvals} payment${approvals > 1 ? "s" : ""} waiting for your approval`, href: "/accounts" });
  if (expenses) a.push({ key: `expenses:${expenses}`, tone: "warn", icon: "doc", text: `${expenses} expense claim${expenses > 1 ? "s" : ""} waiting for your approval`, href: "/accounts/expenses" });
  const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
  if (spend.bills) a.push({ key: `bills:${spend.bills}`, tone: "warn", icon: "doc", text: `${plural(spend.bills, "supplier bill", "supplier bills")} waiting for your approval`, href: "/accounts/bills?show=waiting" });
  if (spend.salaries) a.push({ key: `salaries:${spend.salaries}`, tone: "warn", icon: "doc", text: `${plural(spend.salaries, "salary", "salaries")} waiting for your approval`, href: "/accounts/salaries" });
  if (spend.entries) a.push({ key: `entries:${spend.entries}`, tone: "warn", icon: "doc", text: `${plural(spend.entries, "company payment", "company payments")} waiting for your approval`, href: "/accounts/books" });
  if (transfers) a.push({ key: `transfers:${transfers}`, tone: "warn", icon: "refresh", text: `${transfers} lead / client transfer${transfers > 1 ? "s" : ""} waiting for your approval`, href: "/transfers" });
  if (spend.due) a.push({ key: `bills-due:${spend.due}:${day}`, tone: "bad", icon: "rupee", text: `${spend.due} supplier bill${spend.due > 1 ? "s" : ""} due within a week or overdue`, href: "/accounts/bills?show=topay" });
  if (overdueTasks) a.push({ key: `tasks-overdue:${overdueTasks}:${day}`, tone: "bad", icon: "check", text: `${overdueTasks} overdue to-do${overdueTasks > 1 ? "s" : ""}`, href: "/tasks" });
  if (todayTasks) a.push({ key: `tasks-today:${todayTasks}:${day}`, tone: "warn", icon: "check", text: `${todayTasks} to-do${todayTasks > 1 ? "s" : ""} due today`, href: "/tasks" });
  for (const i of overdue.slice(0, 6))
    a.push({ key: `invoice-overdue:${i.id}`, tone: "bad", icon: "rupee", text: `Overdue: ${i.client.schoolName} · ${i.number}`, href: `/clients/${i.client.id}` });
  if (overdue.length > 6) a.push({ key: `invoices-more:${overdue.length - 6}`, tone: "bad", icon: "rupee", text: `${overdue.length - 6} more overdue invoice(s)`, href: "/outstanding" });
  if (cheques) a.push({ key: `cheques:${cheques}`, tone: "warn", icon: "doc", text: `${cheques} cheque${cheques > 1 ? "s" : ""} in hand, not yet deposited`, href: "/outstanding" });
  if (renewals) a.push({ key: `renewals:${renewals}`, tone: "info", icon: "refresh", text: `${renewals} client${renewals > 1 ? "s" : ""} due for next year's renewal`, href: "/clients" });
  const read = new Set(
    (await db.notificationRead.findMany({ where: { userId: user.id, key: { in: a.map((x) => x.key) } }, select: { key: true } })).map((r) => r.key),
  );
  return a.map((x) => ({ ...x, read: read.has(x.key) }));
}
