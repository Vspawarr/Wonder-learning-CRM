// Sales dashboard metrics. Scope first (a Sales Executive only ever sees their
// own numbers), then the optional executive / state filters.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { COMPETITORS, LOST_REASONS, SOURCES, STAGES, competitorLabel, type Stage } from "@/lib/constants";
import { addDays, fmtDate, fromDbDate, istDayStart, toDbDate, todayIST, type DateStr } from "@/lib/dates";
import { SALES_ROLES, seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope, leadScope, oppScope, taskScope } from "./access";
import { invoiceRows } from "./finance/service";
import { quotationScope } from "./quotation/service";
import { oppValue } from "./queries";
import { periodRange, type DashFilters } from "./dashboard-periods";

export type { DashFilters };

const span = (from: DateStr, to: DateStr) => ({ gte: istDayStart(from), lt: istDayStart(addDays(to, 1)) });

export async function salesDashboard(user: SessionUser, f: DashFilters) {
  const today = todayIST();
  const { from, to } = periodRange(f, today);
  const days = Math.round((istDayStart(to).getTime() - istDayStart(from).getTime()) / 864e5) + 1;
  const prevFrom = addDays(from, -days);
  const prevTo = addDays(from, -1);
  const all = seesAllSales(user.role);
  const exec = all && f.exec ? f.exec : undefined;
  const state = f.state || undefined;

  const leadBase: Prisma.LeadWhereInput = {
    ...leadScope(user),
    ...(exec ? { assignedToId: exec } : {}),
    ...(state ? { state } : {}),
  };
  const oppBase: Prisma.OpportunityWhereInput = {
    ...oppScope(user),
    ...(exec ? { ownerId: exec } : {}),
    ...(state ? { lead: { state } } : {}),
  };
  const period = span(from, to);
  const weeksStart = addDays(today, -55);

  const [leadsNow, leadsPrev, hot, converted, openOpps, closed, weekly, people, interactions, due] = await Promise.all([
    db.lead.findMany({ where: { ...leadBase, createdAt: period }, select: { source: true, status: true, assignedToId: true } }),
    db.lead.count({ where: { ...leadBase, createdAt: span(prevFrom, prevTo) } }),
    db.opportunity.count({ where: { ...oppBase, temperature: "HOT", stage: { notIn: ["WON", "LOST"] } } }),
    db.lead.count({ where: { ...leadBase, convertedAt: period } }),
    db.opportunity.findMany({
      where: { ...oppBase, stage: { notIn: ["WON", "LOST"] } },
    }),
    db.opportunity.findMany({
      where: { ...oppBase, stage: { in: ["WON", "LOST"] }, closedAt: period },
    }),
    db.lead.findMany({ where: { ...leadBase, createdAt: span(weeksStart, today) }, select: { createdAt: true } }),
    db.user.findMany({
      where: all
        ? { role: { in: [...SALES_ROLES] }, ...(exec ? { id: exec } : { active: true }) }
        : { id: user.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.activity.groupBy({
      by: ["byId"],
      where: {
        type: { not: "SYSTEM" },
        occurredAt: period,
        ...(all ? {} : { byId: user.id }),
        ...(exec ? { byId: exec } : {}),
        ...(state ? { OR: [{ lead: { state } }, { opportunity: { lead: { state } } }] } : {}),
      },
      _count: { _all: true },
    }),
    db.task.findMany({
      where: {
        ...taskScope(user),
        ...(exec ? { assigneeId: exec } : {}),
        status: "OPEN",
        dueDate: { lte: toDbDate(today) },
      },
      include: {
        assignee: { select: { id: true, name: true } },
        lead: { select: { id: true, schoolName: true } },
        opportunity: { select: { id: true, schoolName: true } },
        client: { select: { id: true, schoolName: true } },
      },
      orderBy: { dueDate: "asc" },
      take: 8,
    }),
  ]);

  const val = (o: Parameters<typeof oppValue>[0]) => oppValue(o).value;
  const won = closed.filter((o) => o.stage === "WON");
  const lost = closed.filter((o) => o.stage === "LOST");
  const sum = <T,>(xs: T[], fn: (x: T) => number) => xs.reduce((n, x) => n + fn(x), 0);

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const end = addDays(today, -(7 - i) * 7);
    const start = addDays(end, -6);
    const s = istDayStart(start).getTime();
    const e = istDayStart(addDays(end, 1)).getTime();
    return {
      label: fmtDate(start, today),
      value: weekly.filter((l) => l.createdAt.getTime() >= s && l.createdAt.getTime() < e).length,
      color: i === 7 ? "var(--sun)" : "var(--brand)",
    };
  });

  const sources = SOURCES.map((s) => {
    const q = leadsNow.filter((l) => l.source === s);
    return { source: s, leads: q.length, converted: q.filter((l) => l.status === "CONVERTED").length };
  }).filter((r) => r.leads);

  const interactionsBy = new Map(interactions.map((i) => [i.byId, i._count._all]));
  const team = people.map((p) => ({
    id: p.id,
    name: p.name,
    leads: leadsNow.filter((l) => l.assignedToId === p.id).length,
    interactions: interactionsBy.get(p.id) ?? 0,
    open: sum(openOpps.filter((o) => o.ownerId === p.id), val),
    won: sum(won.filter((o) => o.ownerId === p.id), val),
    wonCount: won.filter((o) => o.ownerId === p.id).length,
  }));

  return {
    range: { from, to },
    kpis: {
      leads: leadsNow.length,
      leadsPrev,
      hot,
      converted,
      openValue: sum(openOpps, val),
      openCount: openOpps.length,
      weighted: sum(openOpps, (o) => (val(o) * o.probability) / 100),
      wonValue: sum(won, val),
      wonCount: won.length,
      lostValue: sum(lost, val),
      lostCount: lost.length,
      winRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
      noValue: openOpps.filter((o) => oppValue(o).noValue).length,
    },
    weeks,
    byStage: (STAGES.slice(0, 4) as Stage[]).map((s) => ({
      stage: s,
      value: sum(openOpps.filter((o) => o.stage === s), val),
      count: openOpps.filter((o) => o.stage === s).length,
    })),
    sources,
    team,
    lostReasons: LOST_REASONS.map((r) => ({ label: r, value: lost.filter((o) => o.lostReason === r).length })).filter((x) => x.value),
    // Fixed names first, then each name typed for "Other" (R41).
    competitors: [
      ...COMPETITORS.filter((c) => c !== "Other").map((c) => ({ label: c, value: lost.filter((o) => o.competitor === c).length })),
      ...[...new Set(lost.filter((o) => o.competitor === "Other").map((o) => competitorLabel(o.competitor, o.competitorNote)!))].map((label) => ({
        label,
        value: lost.filter((o) => o.competitor === "Other" && competitorLabel(o.competitor, o.competitorNote) === label).length,
      })),
    ].filter((x) => x.value),
    biggest: [...openOpps]
      .sort((a, b) => val(b) - val(a))
      .slice(0, 5)
      .map((o) => ({ id: o.id, school: o.schoolName, stage: o.stage as Stage, probability: o.probability, value: val(o) })),
    due: due.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: fromDbDate(t.dueDate),
      assignee: t.assignee,
      related: t.client
        ? { href: `/clients/${t.client.id}`, label: t.client.schoolName }
        : t.opportunity
        ? { href: `/opportunities?opp=${t.opportunity.id}`, label: t.opportunity.schoolName }
        : t.lead
          ? { href: `/leads/${t.lead.id}`, label: t.lead.schoolName }
          : null,
    })),
  };
}

/** Live counts for the coloured lifecycle strip (lead → client → cash), not tied to the period filter. */
export async function lifecycleCounts(user: SessionUser) {
  const today = toDbDate(todayIST());
  const [leads, opps, quotes, orders, clients, invoices, todos] = await Promise.all([
    db.lead.count({ where: { ...leadScope(user), status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
    db.opportunity.count({ where: { ...oppScope(user), stage: { notIn: ["WON", "LOST"] } } }),
    db.quotation.count({ where: { ...quotationScope(user), salesOrders: { none: {} } } }),
    db.salesOrder.count({ where: { status: "CONFIRMED", client: { is: clientScope(user) } } }),
    db.client.count({ where: clientScope(user) }),
    invoiceRows(user, { status: "ISSUED" }),
    db.task.count({ where: { ...taskScope(user), assigneeId: user.id, status: "OPEN", dueDate: { lte: today } } }),
  ]);
  const unpaid = invoices.filter((i) => i.balance > 0);
  return {
    leads,
    opps,
    quotes,
    orders,
    clients,
    unpaid: unpaid.length,
    overdue: unpaid.filter((i) => i.state === "OVERDUE").length,
    todos,
  };
}

/** "Service & delivery" section: what still has to be done for signed clients. */
export async function serviceSummary(user: SessionUser, f: DashFilters) {
  const all = seesAllSales(user.role);
  const exec = all && f.exec ? f.exec : undefined;
  const today = todayIST();
  const clientWhere: Prisma.ClientWhereInput = { ...clientScope(user), ...(exec ? { ownerId: exec } : {}), ...(f.state ? { state: f.state } : {}) };
  const taskWhere: Prisma.TaskWhereInput = { ...taskScope(user), ...(exec ? { assigneeId: exec } : {}), status: "OPEN" };
  const [orders, inTransit, onboarding, overdue, dueToday, nextWeek] = await Promise.all([
    db.salesOrder.findMany({
      where: { status: "CONFIRMED", client: { is: clientWhere } },
      select: { id: true, number: true, date: true, client: { select: { id: true, schoolName: true } } },
      orderBy: { date: "asc" },
    }),
    db.dispatch.count({ where: { receivedOn: null, salesOrder: { client: { is: clientWhere } } } }),
    db.client.count({ where: { ...clientWhere, status: "ONBOARDING" } }),
    db.task.count({ where: { ...taskWhere, dueDate: { lt: toDbDate(today) } } }),
    db.task.count({ where: { ...taskWhere, dueDate: toDbDate(today) } }),
    db.task.count({ where: { ...taskWhere, dueDate: { gt: toDbDate(today), lte: toDbDate(addDays(today, 7)) } } }),
  ]);
  return {
    orders: orders.map((o) => ({ id: o.id, number: o.number, date: fromDbDate(o.date), client: o.client })),
    inTransit,
    onboarding,
    tasks: { overdue, dueToday, nextWeek },
  };
}
