// Read models for the pages. Every query here applies the caller's scope, and
// returns plain serialisable objects (dates as YYYY-MM-DD, money as numbers).
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { CLOSED_STAGES, STAGES, type Stage } from "@/lib/constants";
import { fromDbDate, optDate } from "@/lib/dates";
import { SALES_ROLES, canAssignOthers, seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope, leadScope, oppScope, taskScope } from "./access";
import { ACTIVE_LEAD_STATUSES } from "./rules";

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

export type LeadFilters = { q?: string; status?: string; temp?: string; src?: string };

export async function leadsList(user: SessionUser, f: LeadFilters) {
  const where: Prisma.LeadWhereInput = { ...leadScope(user) };
  const status = f.status ?? "Active";
  if (status === "Active") where.status = { in: [...ACTIVE_LEAD_STATUSES] };
  else if (status === "Converted") where.status = "CONVERTED";
  else if (status === "Disqualified") where.status = "DISQUALIFIED";
  if (f.temp && ["HOT", "WARM", "COLD"].includes(f.temp)) where.temperature = f.temp as "HOT";
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
    city: l.city,
    source: l.source,
    interests: l.interests.map((i) => i.product.name),
    status: l.status,
    temperature: l.temperature,
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
    temperature: l.temperature,
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

type OppWithItems = Prisma.OpportunityGetPayload<{ include: { items: true } }>;

/** Value of priced items; `unpriced` counts items without a price. */
export function oppValue(o: Pick<OppWithItems, "items">) {
  let value = 0;
  let unpriced = 0;
  for (const i of o.items) {
    if (i.unitPrice === null) unpriced++;
    else value += Number(i.unitPrice) * i.qty;
  }
  return { value, unpriced };
}

export type OppFilters = { owner?: string; q?: string; stage?: string };

/** Opportunities for the pipeline board and the Opportunities list. */
export async function pipelineCards(user: SessionUser, f: OppFilters = {}) {
  const where: Prisma.OpportunityWhereInput = { ...oppScope(user) };
  if (f.owner && seesAllSales(user.role)) where.ownerId = f.owner;
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
      items: true,
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
      quotations: {
        include: { _count: { select: { items: true } }, preparedBy: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      },
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
    closed: CLOSED_STAGES.includes(o.stage),
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
    quotations: o.quotations.map((q) => ({
      id: q.id,
      number: q.number,
      date: fromDbDate(q.date),
      status: q.status,
      sentVia: q.sentVia,
      sentAt: q.sentAt?.toISOString() ?? null,
      lines: q._count.items,
      preparedBy: q.preparedBy.name,
      shareToken: q.shareToken,
    })),
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

export async function taskList(user: SessionUser, team: boolean) {
  const mine: Prisma.TaskWhereInput = team && seesAllSales(user.role) ? taskScope(user) : { assigneeId: user.id };
  const include = {
    assignee: { select: { id: true, name: true } },
    lead: { select: { id: true, schoolName: true } },
    opportunity: { select: { id: true, schoolName: true, number: true } },
    client: { select: { id: true, schoolName: true } },
  } as const;
  const [open, done] = await Promise.all([
    db.task.findMany({ where: { ...mine, status: "OPEN" }, include, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: 1000 }),
    db.task.findMany({ where: { ...mine, status: "DONE" }, include, orderBy: { completedAt: "desc" }, take: 8 }),
  ]);
  const shape = (t: (typeof open)[number]) => ({
    id: t.id,
    title: t.title,
    type: t.type,
    remark: t.remark,
    dueDate: fromDbDate(t.dueDate),
    priority: t.priority,
    isAuto: t.isAuto,
    outcome: t.outcome,
    assignee: t.assignee,
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

export async function clientDetail(user: SessionUser, id: string) {
  const c = await db.client.findFirst({
    where: { id, ...clientScope(user) },
    include: {
      owner: { select: { id: true, name: true } },
      opportunity: { select: { id: true, number: true, leadId: true, lead: { select: { number: true } } } },
      activities: { include: { by: { select: { id: true, name: true } } }, orderBy: { occurredAt: "desc" }, take: 100 },
      tasks: { where: { status: "OPEN" }, include: { assignee: { select: { name: true } } }, orderBy: { dueDate: "asc" } },
    },
  });
  if (!c) return null;
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
