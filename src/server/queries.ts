// Read models for the pages. Every query here applies the caller's scope, and
// returns plain serialisable objects (dates as YYYY-MM-DD, money as numbers).
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CLOSED_STAGES, STAGES, type Stage } from "@/lib/constants";
import { fmtDateTimeIST, fromDbDate, optDate } from "@/lib/dates";
import { SALES_ROLES, canAssignOthers, seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope, leadScope, oppScope, taskScope } from "./access";
import { ACTIVE_LEAD_STATUSES } from "./rules";
import { outstandingSummary, totals } from "./finance/money";
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
  return db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export type ProductOption = { id: string; name: string; price: number | null; active: boolean };
export async function productOptions(): Promise<ProductOption[]> {
  const ps = await db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  return ps.map((p) => ({ id: p.id, name: p.name, price: p.price === null ? null : Number(p.price), active: p.active }));
}


/* ---------- leads ---------- */

export type LeadFilters = { q?: string; status?: string; src?: string };

export async function leadsList(user: SessionUser, f: LeadFilters) {
  const where: Prisma.LeadWhereInput = { ...leadScope(user) };
  const status = f.status ?? "Active";
  if (status === "Active") where.status = { in: [...ACTIVE_LEAD_STATUSES] };
  else if (status === "Converted") where.status = "CONVERTED";
  else if (status === "Disqualified") where.status = "DISQUALIFIED";
  if (f.src) where.source = f.src;
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
    orderBy: [{ nextFollowUpDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map((l) => ({
    id: l.id,
    number: l.number,
    schoolName: l.schoolName,
    contactName: l.contactName,
    mobile: l.mobile,
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
      opportunities: { select: { id: true, number: true, stage: true }, orderBy: { createdAt: "desc" } },
      activities: { include: { by: { select: { id: true, name: true } } }, orderBy: { occurredAt: "desc" }, take: 100 },
      tasks: {
        where: { status: "OPEN" },
        include: { assignee: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      },
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
    opportunity: l.opportunities[0] ?? null,
    openTasks: l.tasks.map((t) => ({ id: t.id, title: t.title, type: t.type, dueDate: fromDbDate(t.dueDate), assignee: t.assignee.name })),
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
  return { value: o.expectedValue === null ? 0 : Number(o.expectedValue), noValue: o.expectedValue === null };
}

export type OppFilters = { owner?: string; q?: string; stage?: string; cat?: string };

/** Opportunities for the pipeline board and the Opportunities list. */
export async function pipelineCards(user: SessionUser, f: OppFilters = {}) {
  const where: Prisma.OpportunityWhereInput = { ...oppScope(user) };
  if (f.owner && seesAllSales(user.role)) where.ownerId = f.owner;
  if (f.cat && ["HOT", "WARM", "COLD"].includes(f.cat)) where.temperature = f.cat as "HOT";
  if (f.stage === "Open") where.stage = { notIn: [...CLOSED_STAGES] };
  else if (f.stage && (STAGES as readonly string[]).includes(f.stage)) where.stage = f.stage as Stage;
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
    clientId: o.client?.id ?? null,
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
      lead: { select: { id: true, number: true, contactName: true, mobile: true, email: true, city: true, state: true } },
      quotations: { include: quoteInclude, orderBy: { createdAt: "desc" } },
      stageChanges: { include: { changedBy: { select: { name: true } } }, orderBy: { changedAt: "desc" } },
      activities: { include: { by: { select: { id: true, name: true } } }, orderBy: { occurredAt: "desc" }, take: 50 },
      tasks: { where: { status: "OPEN" }, orderBy: { dueDate: "asc" } },
      client: { select: { id: true, number: true } },
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
    openTasks: o.tasks.map((t) => ({ id: t.id, title: t.title, dueDate: fromDbDate(t.dueDate) })),
  };
}
export type OppDetail = NonNullable<Awaited<ReturnType<typeof oppDetail>>>;

/* ---------- tasks ---------- */

/** "followups" = about a lead, deal or client; "todos" = a person's own to-dos. */
export type TaskKind = "all" | "followups" | "todos";

export async function taskList(user: SessionUser, team: boolean, kind: TaskKind = "all") {
  const mine: Prisma.TaskWhereInput = {
    ...(team && seesAllSales(user.role) ? taskScope(user) : { assigneeId: user.id }),
    ...(kind === "todos" ? { leadId: null, opportunityId: null, clientId: null } : {}),
    ...(kind === "followups" ? { OR: [{ leadId: { not: null } }, { opportunityId: { not: null } }, { clientId: { not: null } }] } : {}),
  };
  const include = {
    assignee: { select: { id: true, name: true } },
    lead: { select: { id: true, schoolName: true } },
    opportunity: { select: { id: true, schoolName: true, number: true } },
    client: { select: { id: true, schoolName: true } },
  } as const;
  const [open, done] = await Promise.all([
    db.task.findMany({
      where: { ...mine, status: "OPEN" },
      include,
      orderBy: [{ dueDate: "asc" }, { dueTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 1000,
    }),
    db.task.findMany({ where: { ...mine, status: { in: ["DONE", "CANCELLED"] } }, include, orderBy: { completedAt: "desc" }, take: 15 }),
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
      ? { href: `/opportunities?opp=${t.opportunity.id}`, label: t.opportunity.schoolName }
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
    db.client.findMany({ where: clientScope(user), select: { id: true, schoolName: true }, orderBy: { schoolName: "asc" }, take: 1000 }),
  ]);
  return [
    ...leads.map((l) => ({ value: `lead:${l.id}`, label: `Lead: ${l.schoolName}` })),
    ...opps.map((o) => ({ value: `opp:${o.id}`, label: `Opportunity: ${o.schoolName}` })),
    ...clients.map((c) => ({ value: `client:${c.id}`, label: `Client: ${c.schoolName}` })),
  ];
}

/* ---------- clients ---------- */

export async function clientsList(user: SessionUser, f: { q?: string; status?: string }) {
  const where: Prisma.ClientWhereInput = { ...clientScope(user) };
  if (f.status === "ONBOARDING" || f.status === "ACTIVE") where.status = f.status;
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
  return rows.map((c) => ({
    id: c.id,
    number: c.number,
    schoolName: c.schoolName,
    contactName: c.contactName,
    mobile: c.mobile,
    city: c.city,
    status: c.status,
    since: c.createdAt.toISOString(),
    owner: c.owner,
  }));
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
    itemNames: q.items.map((i) => i.description),
    preparedBy: q.preparedBy.name,
    shareToken: q.shareToken,
  };
}
export type QuoteSummary = ReturnType<typeof quoteSummary>;

export async function clientDetail(user: SessionUser, id: string) {
  const c = await db.client.findFirst({
    where: { id, ...clientScope(user) },
    include: {
      owner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, number: true, leadId: true, lead: { select: { number: true } } } },
      activities: { include: { by: { select: { id: true, name: true } } }, orderBy: { occurredAt: "desc" }, take: 100 },
      tasks: { where: { status: "OPEN" }, include: { assignee: { select: { name: true } } }, orderBy: { dueDate: "asc" } },
      salesOrders: {
        include: { items: true, invoices: { select: { id: true, number: true, status: true } }, quotation: { select: { number: true, createdAt: true } }, poFile: { select: { fileName: true } } },
        orderBy: { createdAt: "desc" },
      },
      payments: { include: { invoice: { select: { number: true } }, recordedBy: { select: { name: true } } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] },
    },
  });
  if (!c) return null;
  // Quotations made on the client (repeat orders) and on the deal it came from.
  const quotations = await db.quotation.findMany({
    where: { OR: [{ clientId: c.id }, { opportunityId: c.opportunityId }] },
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
    openTasks: c.tasks.map((t) => ({ id: t.id, title: t.title, type: t.type, dueDate: fromDbDate(t.dueDate), assignee: t.assignee.name })),
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
      createdAt: fmtDateTimeIST(so.createdAt),
      kits: so.items.reduce((n, i) => n + i.qty, 0),
      lines: so.items.length,
      total: totals(so.items.map((i) => ({ qty: i.qty, price: Number(i.price), gstRate: Number(i.gstRate) }))).total,
      invoice: so.invoices.find((i) => i.status === "ISSUED") ?? null,
    })),
    invoices,
    payments: c.payments.map((p) => ({
      id: p.id,
      number: p.number,
      shareToken: p.shareToken,
      invoiceNumber: p.invoice.number,
      amount: Number(p.amount),
      date: fromDbDate(p.date),
      mode: p.mode,
      reference: p.reference,
      note: p.note,
      recordedBy: p.recordedBy.name,
    })),
    money: outstandingSummary(invoices),
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
