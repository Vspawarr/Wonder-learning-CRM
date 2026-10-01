import { db } from "@/lib/db";
import { clientCode, leadCode, oppCode, STAGE_LABEL } from "@/lib/constants";
import { toDbDate, todayIST } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { clientScope, leadScope, oppScope, taskScope } from "./access";
import { invoiceRows } from "./finance/service";
import { renewalCandidates } from "./renewals";
import { getFeatures } from "./features";

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

export type Alert = { tone: "bad" | "warn" | "info"; icon: "check" | "rupee" | "refresh" | "doc"; text: string; href: string };

export async function attentionAlerts(user: SessionUser): Promise<Alert[]> {
  const today = toDbDate(todayIST());
  const [overdueTasks, todayTasks, invoices, cheques, renewals] = await Promise.all([
    db.task.count({ where: { ...taskScope(user), assigneeId: user.id, status: "OPEN", dueDate: { lt: today } } }),
    db.task.count({ where: { ...taskScope(user), assigneeId: user.id, status: "OPEN", dueDate: today } }),
    invoiceRows(user, { status: { not: "CANCELLED" } }),
    db.payment.count({ where: { status: "IN_HAND", OR: [{ invoice: { client: clientScope(user) } }, { salesOrder: { client: clientScope(user) } }] } }),
    getFeatures().then((f) => (f.renewals ? renewalCandidates(user).then((r) => r.clients.length) : 0)),
  ]);
  const overdue = invoices.filter((i) => i.state === "OVERDUE");
  const a: Alert[] = [];
  if (overdueTasks) a.push({ tone: "bad", icon: "check", text: `${overdueTasks} overdue to-do${overdueTasks > 1 ? "s" : ""}`, href: "/tasks" });
  if (todayTasks) a.push({ tone: "warn", icon: "check", text: `${todayTasks} to-do${todayTasks > 1 ? "s" : ""} due today`, href: "/tasks" });
  for (const i of overdue.slice(0, 6))
    a.push({ tone: "bad", icon: "rupee", text: `Overdue: ${i.client.schoolName} · ${i.number}`, href: `/clients/${i.client.id}` });
  if (overdue.length > 6) a.push({ tone: "bad", icon: "rupee", text: `${overdue.length - 6} more overdue invoice(s)`, href: "/outstanding" });
  if (cheques) a.push({ tone: "warn", icon: "doc", text: `${cheques} cheque${cheques > 1 ? "s" : ""} in hand, not yet deposited`, href: "/outstanding" });
  if (renewals) a.push({ tone: "info", icon: "refresh", text: `${renewals} client${renewals > 1 ? "s" : ""} due for next year's renewal`, href: "/clients" });
  return a;
}
