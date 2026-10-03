// Read models for the pages. Every query here applies the caller's scope, and
// returns plain serialisable objects (dates as YYYY-MM-DD, money as numbers).
import type { Prisma } from "@/generated/prisma/client";
import type { KitSection } from "@/lib/quotation-text";
import { db } from "@/lib/db";
import type { PoDetails } from "./finance/po";
import { CLOSED_STAGES, STAGES, type Stage } from "@/lib/constants";
import { financialYear, fyLabel } from "@/lib/fy";
import { addDays, fmtDateTimeIST, fromDbDate, isDateStr, istDayStart, optDate, toDbDate, todayIST } from "@/lib/dates";

/** Custom "from – to" filter (YYYY-MM-DD, either end optional) on a timestamp column, in India time. */
export function createdBetween(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const f = from && isDateStr(from) ? from : null;
  const t = to && isDateStr(to) ? to : null;
  if (!f && !t) return undefined;
  return { ...(f ? { gte: istDayStart(f) } : {}), ...(t ? { lt: istDayStart(addDays(t, 1)) } : {}) };
}
/** The same for a date-only column (due dates, invoice dates). */
export function dateBetween(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  const f = from && isDateStr(from) ? from : null;
  const t = to && isDateStr(to) ? to : null;
  if (!f && !t) return undefined;
  return { ...(f ? { gte: toDbDate(f) } : {}), ...(t ? { lte: toDbDate(t) } : {}) };
}
/** A financial year's first and last day (undefined = All years). */
export type YearRange = { from: string; to: string } | undefined;

/**
 * Leads that were alive during the year: added before it ended, and either added during it, still open,
 * or converted / disqualified during it. So a lead added in March and still being worked shows in April too.
 */
export function leadsInYear(y: YearRange): Prisma.LeadWhereInput {
  if (!y) return {};
  const start = istDayStart(y.from);
  return {
    createdAt: { lt: istDayStart(addDays(y.to, 1)) },
    OR: [{ createdAt: { gte: start } }, { status: { in: [...ACTIVE_LEAD_STATUSES] } }, { convertedAt: { gte: start } }, { disqualifiedAt: { gte: start } }],
  };
}
/** Opportunities alive during the year: added before it ended, and added during it, still open, or won/lost during it. */
export function oppsInYear(y: YearRange): Prisma.OpportunityWhereInput {
  if (!y) return {};
  const start = istDayStart(y.from);
  return {
    createdAt: { lt: istDayStart(addDays(y.to, 1)) },
    OR: [{ createdAt: { gte: start } }, { closedAt: null }, { closedAt: { gte: start } }],
  };
}

import { SALES_ROLES, canAssignOthers, seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope, leadScope, oppScope, taskScope } from "./access";
import { ACTIVE_LEAD_STATUSES } from "./rules";
import { outstandingSummary, pendingOf, receivedOf, totals } from "./finance/money";
import { invoiceRows } from "./finance/service";

export type Option = { id: string; name: string };

/** People who can be given sales work, as this user may choose them. */
export async function assignees(user: SessionUser): Promise<Option[]> {
  if (!canAssignOthers(user.role)) return [{ id: user.id, name: user.name }];
  return db.user.findMany({
    where: { active: true, role: { in: [...SALES_ROLES] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Anyone active, for task assignment. */
export async function taskAssignees(user: SessionUser): Promise<Option[]> {
  if (!canAssignOthers(user.role)) return [{ id: user.id, name: user.name }];
  return db.user.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export type ProductOption = {
  mrp: number | null;
  id: string;
  name: string;
  price: number | null;
  active: boolean;
  category: string | null;
  /** Kit groups (with item prices where known); null for optional items and services. */
  contents: KitSection[] | null;
};
export async function productOptions(): Promise<ProductOption[]> {
  const ps = await db.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return ps.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price === null ? null : Number(p.price),
    mrp: p.mrp === null ? null : Number(p.mrp),
    active: p.active,
    category: p.category,
    contents: Array.isArray(p.contents) && p.contents.length ? (p.contents as KitSection[]) : null,
  }));
}

/* ---------- leads ---------- */

/** sort: "new" (default, newest first), "old" (oldest first) or "follow" (next follow-up first). */
export type LeadFilters = { q?: string; status?: string; src?: string; sort?: string; from?: string; to?: string; year?: YearRange };

export async function leadsList(user: SessionUser, f: LeadFilters) {
  const where: Prisma.LeadWhereInput = { ...leadScope(user), AND: [leadsInYear(f.year)] };
  const status = f.status || "All";
  if (status === "Active") where.status = { in: [...ACTIVE_LEAD_STATUSES] };
  else if (status === "Converted") where.status = "CONVERTED";
  else if (status === "Disqualified") where.status = "DISQUALIFIED";
  if (f.src) where.source = f.src;
  const added = createdBetween(f.from, f.to);
  if (added) where.createdAt = added;
  const q = f.q?.trim();
  if (q) {
    const num = Number(q.replace(/^L-/i, ""));
    where.OR = [
      { schoolName: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
      ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
    ];
  }
  const rows = await db.lead.findMany({
    where,
    include: {
      assignedTo: { select: { id: true, name: true } },
      interests: { include: { product: { select: { name: true } } } },
    },
    orderBy:
      f.sort === "follow"
        ? [{ nextFollowUpDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }]
        : { createdAt: f.sort === "old" ? "asc" : "desc" },
    take: 500,
  });
  return rows.map((l) => ({
    id: l.id,
    number: l.number,
    schoolName: l.schoolName,
    contactName: l.contactName,
    mobile: l.mobile,
    createdAt: fmtDateTimeIST(l.createdAt),
    city: l.city,
    source: l.source,
    interests: l.interests.map((i) => i.product.name),
    status: l.status,
    owner: l.assignedTo,
    nextFollowUpDate: optDate(l.nextFollowUpDate),
  }));
}

export async function leadDetail(user: SessionUser, id: string) {
  const l = await db.lead.findFirst({
    where: { id, ...leadScope(user) },
    include: {
      assignedTo: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      interests: { include: { product: { select: { id: true, name: true } } } },
      opportunities: {
        select: { id: true, number: true, stage: true },
        orderBy: { createdAt: "desc" },
      },
      activities: {
        include: { by: { select: { id: true, name: true } } },
        orderBy: { occurredAt: "desc" },
        take: 100,
      },
      tasks: {
        where: { status: "OPEN" },
        include: { assignee: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      },
      // Quotations made while it is still a lead (they move to the opportunity on conversion).
      quotations: { where: { opportunityId: null, clientId: null }, include: quoteInclude, orderBy: { createdAt: "desc" } },
    },
  });
  if (!l) return null;
  return {
    id: l.id,
    number: l.number,
    schoolName: l.schoolName,
    contactName: l.contactName,
    designation: l.designation,
    mobile: l.mobile,
    email: l.email,
    state: l.state,
    city: l.city,
    area: l.area,
    address: l.address,
    currentCurriculum: l.currentCurriculum,
    studentStrength: l.studentStrength,
    branches: l.branches,
    source: l.source,
    referenceName: l.referenceName,
    remarks: l.remarks,
    status: l.status,
    assignedTo: l.assignedTo,
    createdBy: l.createdBy.name,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
    nextFollowUpDate: optDate(l.nextFollowUpDate),
    followUpType: l.followUpType,
    followUpRemark: l.followUpRemark,
    disqualifyReason: l.disqualifyReason,
    disqualifyRemarks: l.disqualifyRemarks,
    interests: l.interests.map((i) => i.product),
    quotations: l.quotations.map(quoteSummary),
    opportunity: l.opportunities[0] ?? null,
    openTasks: l.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      dueDate: fromDbDate(t.dueDate),
      assignee: t.assignee.name,
    })),
    activities: l.activities.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      summary: a.summary,
      nextAction: a.nextAction,
      at: a.occurredAt.toISOString(),
      by: a.by,
    })),
  };
}
export type LeadDetail = NonNullable<Awaited<ReturnType<typeof leadDetail>>>;

/* ---------- opportunities ---------- */

/** A deal's value is the expected value its owner typed; `noValue` marks deals without one. */
export function oppValue(o: { expectedValue: Prisma.Decimal | null }) {
  return {
    value: o.expectedValue === null ? 0 : Number(o.expectedValue),
    noValue: o.expectedValue === null,
  };
}

export type OppFilters = {
  owner?: string;
  q?: string;
  stage?: string;
  cat?: string;
  /** Added (created) between these dates. */
  from?: string;
  to?: string;
  /** The chosen financial year (deals alive during it). */
  year?: YearRange;
};

/** Opportunities for the pipeline board and the Opportunities list. */
export async function pipelineCards(user: SessionUser, f: OppFilters = {}) {
  const where: Prisma.OpportunityWhereInput = { ...oppScope(user), AND: [oppsInYear(f.year)] };
  if (f.owner && seesAllSales(user.role)) where.ownerId = f.owner;
  if (f.cat && ["HOT", "WARM", "COLD"].includes(f.cat)) where.temperature = f.cat as "HOT";
  if (f.stage === "Open") where.stage = { notIn: [...CLOSED_STAGES] };
  else if (f.stage && (STAGES as readonly string[]).includes(f.stage)) where.stage = f.stage as Stage;
  const added = createdBetween(f.from, f.to);
  if (added) where.createdAt = added;
  const q = f.q?.trim();
  if (q) {
    const num = Number(q.replace(/^O-/i, ""));
    where.OR = [
      { schoolName: { contains: q, mode: "insensitive" } },
      { lead: { contactName: { contains: q, mode: "insensitive" } } },
      { lead: { city: { contains: q, mode: "insensitive" } } },
      ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
    ];
  }
  const rows = await db.opportunity.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      lead: { select: { contactName: true, city: true } },
      client: { select: { id: true } },
    },
    orderBy: [{ expectedCloseDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  return rows.map((o) => ({
    id: o.id,
    number: o.number,
    schoolName: o.schoolName,
    stage: o.stage as Stage,
    probability: o.probability,
    temperature: o.temperature,
    competitor: o.competitor,
    lostReason: o.lostReason,
    expectedCloseDate: optDate(o.expectedCloseDate),
    nextAction: o.nextAction,
    nextActionDate: optDate(o.nextActionDate),
    closedAt: o.closedAt?.toISOString() ?? null,
    owner: o.owner,
    contactName: o.lead?.contactName ?? null,
    city: o.lead?.city ?? null,
    clientId: o.client?.id ?? o.renewalOfId ?? null,
    renewal: o.academicYear,
    ...oppValue(o),
  }));
}
export type PipelineCard = Awaited<ReturnType<typeof pipelineCards>>[number];

export async function oppDetail(user: SessionUser, id: string) {
  const o = await db.opportunity.findFirst({
    where: { id, ...oppScope(user) },
    include: {
      items: { include: { product: { select: { name: true } } } },
      owner: { select: { id: true, name: true } },
      lead: {
        select: {
          id: true,
          number: true,
          contactName: true,
          mobile: true,
          email: true,
          city: true,
          state: true,
        },
      },
      quotations: { include: quoteInclude, orderBy: { createdAt: "desc" } },
      stageChanges: {
        include: { changedBy: { select: { name: true } } },
        orderBy: { changedAt: "desc" },
      },
      activities: {
        include: { by: { select: { id: true, name: true } } },
        orderBy: { occurredAt: "desc" },
        take: 50,
      },
      tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" } },
      client: { select: { id: true, number: true } },
      renewalOf: { select: { id: true, number: true, schoolName: true } },
    },
  });
  if (!o) return null;
  return {
    id: o.id,
    number: o.number,
    schoolName: o.schoolName,
    stage: o.stage as Stage,
    probability: o.probability,
    temperature: o.temperature,
    closed: CLOSED_STAGES.includes(o.stage),
    expectedValue: o.expectedValue === null ? null : Number(o.expectedValue),
    expectedCloseDate: optDate(o.expectedCloseDate),
    competitor: o.competitor,
    decisionMaker: o.decisionMaker,
    nextAction: o.nextAction,
    nextActionDate: optDate(o.nextActionDate),
    lostReason: o.lostReason,
    lostRemarks: o.lostRemarks,
    owner: o.owner,
    lead: o.lead,
    client: o.client,
    renewalOf: o.renewalOf,
    academicYear: o.academicYear,
    quotations: o.quotations.map(quoteSummary),
    items: o.items.map((i) => ({
      productId: i.productId,
      name: i.product.name,
      qty: i.qty,
      unitPrice: i.unitPrice === null ? null : Number(i.unitPrice),
    })),
    ...oppValue(o),
    stageChanges: o.stageChanges.map((s) => ({
      id: s.id,
      from: s.fromStage as Stage | null,
      to: s.toStage as Stage,
      by: s.changedBy.name,
      at: s.changedAt.toISOString(),
    })),
    activities: o.activities.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      summary: a.summary,
      nextAction: a.nextAction,
      at: a.occurredAt.toISOString(),
      by: a.by,
    })),
    openTasks: o.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: fromDbDate(t.dueDate),
    })),
  };
}
export type OppDetail = NonNullable<Awaited<ReturnType<typeof oppDetail>>>;

/* ---------- tasks ---------- */

/** "followups" = about a lead, deal or client; "todos" = a person's own to-dos. */
export type TaskKind = "all" | "followups" | "todos";

export async function taskList(user: SessionUser, team: boolean, kind: TaskKind = "all", range: { from?: string; to?: string } = {}) {
  const due = dateBetween(range.from, range.to);
  const mine: Prisma.TaskWhereInput = {
    ...(team && seesAllSales(user.role) ? taskScope(user) : { assigneeId: user.id }),
    ...(kind === "todos" ? { leadId: null, opportunityId: null, clientId: null } : {}),
    ...(kind === "followups"
      ? {
          OR: [{ leadId: { not: null } }, { opportunityId: { not: null } }, { clientId: { not: null } }],
        }
      : {}),
  };
  const include = {
    assignee: { select: { id: true, name: true } },
    lead: { select: { id: true, schoolName: true } },
    opportunity: { select: { id: true, schoolName: true, number: true } },
    client: { select: { id: true, schoolName: true } },
  } as const;
  const [open, done] = await Promise.all([
    db.task.findMany({
      where: { ...mine, status: "OPEN", ...(due ? { dueDate: due } : {}) },
      include,
      orderBy: [{ dueDate: "asc" }, { dueTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 1000,
    }),
    db.task.findMany({
      where: { ...mine, status: { in: ["DONE", "CANCELLED"] }, ...(due ? { dueDate: due } : {}) },
      include,
      orderBy: { completedAt: "desc" },
      take: due ? 500 : 15,
    }),
  ]);
  const shape = (t: (typeof open)[number]) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    remark: t.remark,
    dueDate: fromDbDate(t.dueDate),
    dueTime: t.dueTime,
    postponedCount: t.postponedCount,
    postponeReason: t.postponeReason,
    status: t.status,
    priority: t.priority,
    isAuto: t.isAuto,
    outcome: t.outcome,
    assignee: t.assignee,
    invoiceId: t.invoiceId,
    // Converted leads' tasks carry on under the opportunity.
    related: t.client
      ? { href: `/clients/${t.client.id}`, label: t.client.schoolName }
      : t.opportunity
        ? {
            href: `/opportunities?opp=${t.opportunity.id}`,
            label: t.opportunity.schoolName,
          }
        : t.lead
          ? { href: `/leads/${t.lead.id}`, label: t.lead.schoolName }
          : null,
  });
  return { open: open.map(shape), done: done.map(shape) };
}
export type TaskRow = Awaited<ReturnType<typeof taskList>>["open"][number];

/** Leads, opportunities and clients this user can link a new task to. */
export async function taskTargets(user: SessionUser) {
  const [leads, opps, clients] = await Promise.all([
    db.lead.findMany({
      where: { ...leadScope(user), status: { in: [...ACTIVE_LEAD_STATUSES] } },
      select: { id: true, schoolName: true },
      orderBy: { schoolName: "asc" },
      take: 1000,
    }),
    db.opportunity.findMany({
      where: { ...oppScope(user), stage: { notIn: [...CLOSED_STAGES] } },
      select: { id: true, schoolName: true },
      orderBy: { schoolName: "asc" },
      take: 1000,
    }),
    db.client.findMany({
      where: clientScope(user),
      select: { id: true, schoolName: true },
      orderBy: { schoolName: "asc" },
      take: 1000,
    }),
  ]);
  return [
    ...leads.map((l) => ({
      value: `lead:${l.id}`,
      label: `Lead: ${l.schoolName}`,
    })),
    ...opps.map((o) => ({
      value: `opp:${o.id}`,
      label: `Opportunity: ${o.schoolName}`,
    })),
    ...clients.map((c) => ({
      value: `client:${c.id}`,
      label: `Client: ${c.schoolName}`,
    })),
  ];
}

/* ---------- clients ---------- */

/** How a client stands in the chosen year (R31): ordered again, first order, came back, didn't renew, or no order. */
export type YearStanding = "RENEWED" | "NEW" | "BACK" | "NOT_RENEWED" | "NONE";
export const YEAR_STANDING_LABEL: Record<YearStanding, string> = {
  RENEWED: "Renewed",
  NEW: "New",
  BACK: "Ordered again",
  NOT_RENEWED: "Not renewed",
  NONE: "No order",
};
/** Filter chips on Clients: which standings each shows. */
export const YEAR_FILTERS: Record<string, YearStanding[]> = {
  ordered: ["RENEWED", "NEW", "BACK"],
  renewed: ["RENEWED"],
  new: ["NEW"],
  notrenewed: ["NOT_RENEWED"],
  none: ["NONE", "NOT_RENEWED"],
};

export async function clientsList(user: SessionUser, f: { q?: string; status?: string; from?: string; to?: string; year?: YearRange; yr?: string }) {
  // Clients are never hidden by year (so schools that didn't continue can be contacted again), except
  // schools that only became clients after the chosen year.
  const where: Prisma.ClientWhereInput = { ...clientScope(user), ...(f.year ? { AND: [{ createdAt: { lt: istDayStart(addDays(f.year.to, 1)) } }] } : {}) };
  if (f.status === "ONBOARDING" || f.status === "ACTIVE") where.status = f.status;
  const since = createdBetween(f.from, f.to);
  if (since) where.createdAt = since;
  const q = f.q?.trim();
  if (q) {
    const num = Number(q.replace(/^C-/i, ""));
    where.OR = [
      { schoolName: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
      { mobile: { contains: q } },
      ...(Number.isInteger(num) && num > 0 ? [{ number: num }] : []),
    ];
  }
  const rows = await db.client.findMany({
    where,
    include: { owner: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  // Orders (not cancelled) per client, by financial year, for the year standing and the "last ordered" year.
  const orders = rows.length
    ? await db.salesOrder.findMany({
        where: { clientId: { in: rows.map((c) => c.id) }, status: { not: "CANCELLED" } },
        select: { clientId: true, date: true, items: { select: { qty: true, price: true } } },
      })
    : [];
  const byClient = new Map<string, { years: Set<number>; amount: Map<number, number> }>();
  for (const o of orders) {
    const fy = financialYear(fromDbDate(o.date)).start;
    const e = byClient.get(o.clientId) ?? { years: new Set<number>(), amount: new Map<number, number>() };
    e.years.add(fy);
    e.amount.set(fy, (e.amount.get(fy) ?? 0) + o.items.reduce((t, i) => t + i.qty * Number(i.price), 0));
    byClient.set(o.clientId, e);
  }
  const y = f.year ? financialYear(f.year.from).start : null;
  const out = rows.map((c) => {
    const e = byClient.get(c.id);
    const years = e ? [...e.years].sort((a, b) => a - b) : [];
    let standing: YearStanding | null = null;
    if (y !== null) {
      const now = years.includes(y);
      const prev = years.includes(y - 1);
      const before = years.some((v) => v < y);
      standing = now ? (prev ? "RENEWED" : before ? "BACK" : "NEW") : prev ? "NOT_RENEWED" : "NONE";
    }
    return {
      id: c.id,
      number: c.number,
      schoolName: c.schoolName,
      contactName: c.contactName,
      mobile: c.mobile,
      city: c.city,
      status: c.status,
      since: c.createdAt.toISOString(),
      owner: c.owner,
      /** Standing in the chosen year (null for All years). */
      standing,
      /** Ordered value in the chosen year (kits × rate, before GST). */
      yearAmount: y !== null ? Math.round(e?.amount.get(y) ?? 0) : null,
      /** "2025-26": the last year this school ordered, if ever. */
      lastOrdered: years.length ? fyLabel(years[years.length - 1]) : null,
    };
  });
  const keep = f.yr && y !== null ? YEAR_FILTERS[f.yr] : undefined;
  return keep ? out.filter((c) => c.standing && keep.includes(c.standing)) : out;
}

const quoteInclude = {
  _count: { select: { items: true } },
  preparedBy: { select: { name: true } },
  items: { select: { description: true }, orderBy: { sortOrder: "asc" } },
} as const;

function quoteSummary(q: Prisma.QuotationGetPayload<{ include: typeof quoteInclude }>) {
  return {
    id: q.id,
    number: q.number,
    date: fromDbDate(q.date),
    status: q.status,
    sentVia: q.sentVia,
    sentAt: q.sentAt?.toISOString() ?? null,
    lines: q._count.items,
    createdAt: fmtDateTimeIST(q.createdAt),
    validUntil: addDays(fromDbDate(q.date), q.validityDays),
    expired: q.status === "SENT" && addDays(fromDbDate(q.date), q.validityDays) < todayIST(),
    itemNames: q.items.map((i) => i.description),
    preparedBy: q.preparedBy.name,
    shareToken: q.shareToken,
    poNumber: q.poNumber,
    poDetails: (q.poDetails ?? null) as PoDetails | null,
  };
}
export type QuoteSummary = ReturnType<typeof quoteSummary>;

export async function clientDetail(user: SessionUser, id: string) {
  const c = await db.client.findFirst({
    where: { id, ...clientScope(user) },
    include: {
      owner: { select: { id: true, name: true } },
      opportunity: {
        select: {
          id: true,
          number: true,
          leadId: true,
          lead: { select: { number: true } },
        },
      },
      activities: {
        include: { by: { select: { id: true, name: true } } },
        orderBy: { occurredAt: "desc" },
        take: 100,
      },
      tasks: {
        where: { status: "OPEN" },
        include: { assignee: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      },
      salesOrders: {
        include: {
          items: true,
          invoices: { select: { id: true, number: true, status: true } },
          quotation: { select: { number: true, createdAt: true } },
          poFile: { select: { fileName: true } },
          advances: {
            where: { invoiceId: null },
            select: { amount: true, status: true },
          },
          dispatches: {
            include: {
              items: { select: { salesOrderItemId: true, qty: true } },
              files: { select: { id: true, fileName: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      creditNotes: {
        include: {
          invoice: { select: { number: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      files: {
        where: { dispatchId: null },
        select: {
          id: true,
          category: true,
          title: true,
          fileName: true,
          size: true,
          uploadedAt: true,
          uploadedBy: { select: { name: true } },
        },
        orderBy: { uploadedAt: "desc" },
      },
      contacts: { orderBy: { createdAt: "asc" } },
      payments: {
        include: {
          invoice: { select: { number: true } },
          salesOrder: { select: { number: true } },
          recordedBy: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!c) return null;
  // Quotations made on the client (repeat orders) and on the deal it came from.
  const quotations = await db.quotation.findMany({
    where: {
      OR: [{ clientId: c.id }, { opportunityId: c.opportunityId }, { opportunity: { renewalOfId: c.id } }],
    },
    include: quoteInclude,
    orderBy: { createdAt: "desc" },
  });
  const invoices = await invoiceRows(user, { clientId: c.id });
  return {
    id: c.id,
    number: c.number,
    schoolName: c.schoolName,
    contactName: c.contactName,
    designation: c.designation,
    mobile: c.mobile,
    email: c.email,
    state: c.state,
    city: c.city,
    area: c.area,
    address: c.address,
    currentCurriculum: c.currentCurriculum,
    studentStrength: c.studentStrength,
    branches: c.branches,
    status: c.status,
    since: c.createdAt.toISOString(),
    onboardingCompletedAt: c.onboardingCompletedAt?.toISOString() ?? null,
    owner: c.owner,
    opportunity: c.opportunity,
    openTasks: c.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      type: t.type,
      dueDate: fromDbDate(t.dueDate),
      assignee: t.assignee.name,
    })),
    quotations: quotations.map(quoteSummary),
    salesOrders: c.salesOrders.map((so) => ({
      id: so.id,
      number: so.number,
      date: fromDbDate(so.date),
      expectedDelivery: so.expectedDelivery ? fromDbDate(so.expectedDelivery) : null,
      deliveredOn: so.deliveredOn ? fromDbDate(so.deliveredOn) : null,
      status: so.status,
      notes: so.notes,
      quotationNumber: so.quotation?.number ?? null,
      quotationCreatedAt: so.quotation ? fmtDateTimeIST(so.quotation.createdAt) : null,
      poNumber: so.poNumber,
      poDate: so.poDate ? fromDbDate(so.poDate) : null,
      poFileName: so.poFile?.fileName ?? null,
      proformaNumber: so.proformaNumber,
      items: so.items
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          id: i.id,
          description: i.description,
          qty: i.qty,
          sent: so.dispatches.reduce((t, d) => t + d.items.filter((x) => x.salesOrderItemId === i.id).reduce((n, x) => n + x.qty, 0), 0),
        })),
      dispatches: so.dispatches.map((d) => ({
        id: d.id,
        number: d.number,
        date: fromDbDate(d.date),
        transporter: d.transporter,
        docketNo: d.docketNo,
        kits: d.items.reduce((t, x) => t + x.qty, 0),
        receivedOn: d.receivedOn ? fromDbDate(d.receivedOn) : null,
        pod: d.files[0] ?? null,
      })),
      advanceReceived: receivedOf(so.advances),
      advancePending: pendingOf(so.advances),
      createdAt: fmtDateTimeIST(so.createdAt),
      kits: so.items.reduce((n, i) => n + i.qty, 0),
      lines: so.items.length,
      total: totals(
        so.items.map((i) => ({
          qty: i.qty,
          price: Number(i.price),
          gstRate: Number(i.gstRate),
        })),
      ).total,
      invoice: so.invoices.find((i) => i.status === "ISSUED") ?? null,
    })),
    invoices,
    payments: c.payments.map((p) => ({
      id: p.id,
      number: p.number,
      shareToken: p.shareToken,
      invoiceNumber: p.invoice?.number ?? null,
      orderNumber: p.salesOrder?.number ?? null,
      status: p.status,
      bank: p.bank,
      chequeDate: p.chequeDate ? fromDbDate(p.chequeDate) : null,
      amount: Number(p.amount),
      date: fromDbDate(p.date),
      mode: p.mode,
      reference: p.reference,
      note: p.note,
      recordedBy: p.recordedBy.name,
    })),
    money: outstandingSummary(invoices),
    documents: c.files.map((f) => ({
      id: f.id,
      category: f.category,
      title: f.title,
      fileName: f.fileName,
      size: f.size,
      uploadedAt: f.uploadedAt.toISOString(),
      by: f.uploadedBy.name,
    })),
    contacts: c.contacts.map((k) => ({
      id: k.id,
      name: k.name,
      role: k.role,
      mobile: k.mobile,
      email: k.email,
      forPayments: k.forPayments,
    })),
    /** For "Send to" choices on reminders and receipts. */
    people: c.contacts.map((k) => ({
      name: k.name,
      role: k.role,
      mobile: k.mobile,
      email: k.email,
      forPayments: k.forPayments,
    })),
    creditNotes: c.creditNotes.map((n) => ({
      id: n.id,
      number: n.number,
      invoiceNumber: n.invoice.number,
      date: fromDbDate(n.date),
      amount: Number(n.amount),
      reason: n.reason,
      by: n.createdBy.name,
    })),
    activities: c.activities.map((a) => ({
      id: a.id,
      type: a.type,
      subject: a.subject,
      summary: a.summary,
      nextAction: a.nextAction,
      at: a.occurredAt.toISOString(),
      by: a.by,
    })),
  };
}
export type ClientDetail = NonNullable<Awaited<ReturnType<typeof clientDetail>>>;
