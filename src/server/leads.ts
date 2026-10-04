import { db, type Tx } from "@/lib/db";
import { LEAD_STATUS_LABEL, REF_SOURCES, TEMPERATURE_LABEL, clientCode, leadCode, oppCode } from "@/lib/constants";
import { STAGE_PROBABILITY } from "@/lib/constants";
import { addDays, todayIST, toDbDate } from "@/lib/dates";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { assertAssignable, leadScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { isActiveLead } from "./rules";
import { assertLocation } from "./locations";
import { convertInput, disqualifyInput, leadInput, parse } from "./validation";
import type { Temperature } from "@/generated/prisma/enums";

async function loadLead(tx: Tx, user: SessionUser, id: string) {
  const lead = await tx.lead.findFirst({ where: { id, ...leadScope(user) } });
  if (!lead) throw new NotFoundError("Lead");
  return lead;
}

async function checkProducts(tx: Tx, ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return unique;
  const n = await tx.product.count({ where: { id: { in: unique }, active: true } });
  if (n !== unique.length) throw new DomainError("One of the chosen products is not available.");
  return unique;
}

const followUpTitle = (type: string, remark: string | null, school: string) =>
  remark || `First ${type.toLowerCase()}: ${school}`;

export async function createLead(user: SessionUser, raw: unknown) {
  const d = parse(leadInput, raw);
  return db.$transaction(async (tx) => {
    await assertAssignable(tx, user, d.assignedToId);
    await assertLocation(tx, d.state, d.city);
    const interests = await checkProducts(tx, d.interests);
    const lead = await tx.lead.create({
      data: {
        schoolName: d.schoolName,
        contactName: d.contactName,
        designation: d.designation,
        mobile: d.mobile,
        email: d.email,
        state: d.state,
        city: d.city,
        area: d.area,
        address: d.address,
        currentCurriculum: d.currentCurriculum,
        studentStrength: d.studentStrength,
        branches: d.branches,
        source: d.source,
        referenceName: REF_SOURCES.includes(d.source) ? d.referenceName : null,
        remarks: d.remarks,
        status: d.status,
        assignedToId: d.assignedToId,
        createdById: user.id,
        nextFollowUpDate: toDbDate(d.nextFollowUpDate),
        followUpType: d.followUpType,
        followUpRemark: d.followUpRemark,
        interests: { create: interests.map((productId) => ({ productId })) },
      },
    });
    const type = d.followUpType ?? "Call";
    await tx.task.create({
      data: {
        type,
        title: followUpTitle(type, d.followUpRemark, d.schoolName),
        remark: d.followUpRemark,
        dueDate: toDbDate(d.nextFollowUpDate),
        priority: "HIGH",
        isAuto: true,
        assigneeId: d.assignedToId,
        createdById: user.id,
        leadId: lead.id,
      },
    });
    await tx.activity.create({
      data: { type: "SYSTEM", subject: `Lead ${leadCode(lead.number)} created`, byId: user.id, leadId: lead.id },
    });
    // A lead created as Qualified becomes an opportunity straight away.
    if (d.status === "QUALIFIED") await convertInTx(tx, user, lead, d.temperature!);
    return lead.id;
  });
}

export async function updateLead(user: SessionUser, id: string, raw: unknown) {
  const d = parse(leadInput, raw);
  return db.$transaction(async (tx) => {
    const lead = await loadLead(tx, user, id);
    if (!isActiveLead(lead.status))
      throw new DomainError(`This lead is ${LEAD_STATUS_LABEL[lead.status].toLowerCase()} and can no longer be edited.`);
    if (d.assignedToId !== lead.assignedToId) await assertAssignable(tx, user, d.assignedToId);
    await assertLocation(tx, d.state, d.city, lead);

    // "Interested in" and "Remarks" are no longer on the form; existing values are kept as they are.
    await tx.lead.update({
      where: { id },
      data: {
        schoolName: d.schoolName,
        contactName: d.contactName,
        designation: d.designation,
        mobile: d.mobile,
        email: d.email,
        state: d.state,
        city: d.city,
        area: d.area,
        address: d.address,
        currentCurriculum: d.currentCurriculum,
        studentStrength: d.studentStrength,
        branches: d.branches,
        source: d.source,
        referenceName: REF_SOURCES.includes(d.source) ? d.referenceName : null,
        status: d.status,
        assignedToId: d.assignedToId,
        nextFollowUpDate: toDbDate(d.nextFollowUpDate),
        followUpType: d.followUpType,
        followUpRemark: d.followUpRemark,
      },
    });

    const notes: string[] = [];
    if (d.status !== lead.status) notes.push(`Status: ${LEAD_STATUS_LABEL[lead.status]} → ${LEAD_STATUS_LABEL[d.status]}`);
    if (d.assignedToId !== lead.assignedToId) {
      const to = await tx.user.findUniqueOrThrow({ where: { id: d.assignedToId }, select: { name: true } });
      notes.push(`Reassigned to ${to.name}`);
      await tx.task.updateMany({ where: { leadId: id, status: "OPEN" }, data: { assigneeId: d.assignedToId } });
    }

    // Keep the lead's current follow-up task in step with its follow-up fields.
    const type = d.followUpType ?? "Call";
    const current = await tx.task.findFirst({ where: { leadId: id, status: "OPEN" }, orderBy: { createdAt: "desc" } });
    const due = toDbDate(d.nextFollowUpDate);
    if (current) {
      const changed =
        current.dueDate.getTime() !== due.getTime() ||
        (lead.followUpType ?? "Call") !== type ||
        lead.followUpRemark !== d.followUpRemark;
      if (changed)
        await tx.task.update({
          where: { id: current.id },
          data: { dueDate: due, type, remark: d.followUpRemark, ...(d.followUpRemark ? { title: d.followUpRemark } : {}) },
        });
    } else {
      await tx.task.create({
        data: {
          type,
          title: d.followUpRemark || `Follow up: ${d.schoolName}`,
          remark: d.followUpRemark,
          dueDate: due,
          priority: "HIGH",
          isAuto: true,
          assigneeId: d.assignedToId,
          createdById: user.id,
          leadId: id,
        },
      });
    }

    if (notes.length)
      await tx.activity.create({ data: { type: "SYSTEM", subject: notes.join(" · "), byId: user.id, leadId: id } });

    // A lead marked Qualified becomes an opportunity straight away.
    if (d.status === "QUALIFIED") await convertInTx(tx, user, await tx.lead.findUniqueOrThrow({ where: { id } }), d.temperature!);
  });
}

export async function disqualifyLead(user: SessionUser, id: string, raw: unknown) {
  const d = parse(disqualifyInput, raw);
  return db.$transaction(async (tx) => {
    const lead = await loadLead(tx, user, id);
    if (!isActiveLead(lead.status)) throw new DomainError("Only an active lead can be disqualified.");
    await tx.lead.update({
      where: { id },
      data: {
        status: "DISQUALIFIED",
        disqualifyReason: d.reason,
        disqualifyRemarks: d.remarks,
        disqualifiedAt: new Date(),
        nextFollowUpDate: null,
      },
    });
    await tx.task.updateMany({
      where: { leadId: id, status: "OPEN" },
      data: { status: "CANCELLED", outcome: "Lead disqualified", completedAt: new Date() },
    });
    await tx.activity.create({
      data: { type: "SYSTEM", subject: `Disqualified: ${d.reason}`, summary: d.remarks, byId: user.id, leadId: id },
    });
  });
}

/** Creates an Opportunity from an active lead. Returns the opportunity id. */
export async function convertLead(user: SessionUser, id: string, raw: unknown) {
  const { temperature } = parse(convertInput, raw);
  return db.$transaction(async (tx) => convertInTx(tx, user, await loadLead(tx, user, id), temperature));
}

type LeadRow = Awaited<ReturnType<typeof loadLead>>;

/** Shared by convertLead and the automatic conversion when a lead is marked Qualified. */
async function convertInTx(tx: Tx, user: SessionUser, lead: LeadRow, temperature: Temperature) {
  const id = lead.id;
  if (!isActiveLead(lead.status)) throw new DomainError("Only an active lead can be converted.");
  const existing = await tx.opportunity.findFirst({ where: { leadId: id }, select: { id: true } });
  if (existing) throw new DomainError("This lead already has an opportunity.");

  const interests = await tx.leadInterest.findMany({ where: { leadId: id }, include: { product: true } });
  const today = todayIST();
  // A school that already received a quotation as a lead starts at Proposal Sent (R33), not Interested.
  const quoted = (await tx.quotation.count({ where: { leadId: id, opportunityId: null, clientId: null, status: "SENT" } })) > 0;
  const stage = quoted ? "PROPOSAL_SENT" : "INTERESTED";
  const opp = await tx.opportunity.create({
    data: {
      leadId: id,
      schoolName: lead.schoolName,
      stage,
      probability: STAGE_PROBABILITY[stage],
      temperature,
      expectedCloseDate: toDbDate(addDays(today, 30)),
      decisionMaker: lead.contactName,
      nextAction: quoted ? "Follow up on the quotation" : "Schedule demo",
      nextActionDate: toDbDate(addDays(today, 2)),
      ownerId: lead.assignedToId,
      createdById: user.id,
      items: { create: interests.map((i) => ({ productId: i.productId, qty: 1, unitPrice: i.product.price })) },
      stageChanges: { create: { toStage: stage, changedById: user.id } },
    },
  });
  await tx.lead.update({
    where: { id },
    data: { status: "CONVERTED", convertedAt: new Date(), nextFollowUpDate: null },
  });
  // Pending lead follow-ups and quotations made at the lead stage carry on under the opportunity.
  await tx.task.updateMany({ where: { leadId: id, status: "OPEN" }, data: { opportunityId: opp.id } });
  await tx.quotation.updateMany({ where: { leadId: id, opportunityId: null, clientId: null }, data: { opportunityId: opp.id } });
  await tx.task.create({
    data: {
      type: quoted ? "Call" : "Online Demo",
      title: quoted ? `Follow up on the quotation: ${lead.schoolName}` : `Schedule demo: ${lead.schoolName}`,
      dueDate: toDbDate(addDays(today, 2)),
      priority: "MEDIUM",
      isAuto: true,
      assigneeId: lead.assignedToId,
      createdById: user.id,
      opportunityId: opp.id,
      leadId: id,
    },
  });
  await tx.activity.create({
    data: {
      type: "SYSTEM",
      subject: `Converted to opportunity ${oppCode(opp.number)} · ${TEMPERATURE_LABEL[temperature]}`,
      byId: user.id,
      leadId: id,
      opportunityId: opp.id,
    },
  });
  return opp.id;
}

export type DuplicateMatch = { kind: "Lead" | "Client"; code: string; schoolName: string; city: string; owner: string; status: string; href: string | null };

/**
 * Leads and clients that look like the same school: same mobile number (last 10 digits)
 * or same school name in the same city. Checked company-wide so two people don't chase
 * one school; details are only linked when the user may open them.
 */
export async function findDuplicateLeads(user: SessionUser, raw: { schoolName?: string; mobile?: string; city?: string; excludeLeadId?: string }) {
  const digits = (raw.mobile ?? "").replace(/\D/g, "").slice(-10);
  const name = (raw.schoolName ?? "").trim().toLowerCase();
  const city = (raw.city ?? "").trim().toLowerCase();
  if (digits.length < 10 && !(name && city)) return [];
  const mobileLike = digits.length === 10 ? `%${digits}` : "__no_match__";
  const [leads, clients] = await Promise.all([
    db.$queryRaw<{ id: string; number: number; schoolName: string; city: string; status: string; assignedToId: string; owner: string }[]>`
      SELECT l.id, l.number, l."schoolName", l.city, l.status::text AS status, l."assignedToId", u.name AS owner
      FROM "Lead" l JOIN "User" u ON u.id = l."assignedToId"
      WHERE (regexp_replace(l.mobile, '[^0-9]', '', 'g') LIKE ${mobileLike}
         OR (lower(trim(l."schoolName")) = ${name} AND lower(trim(l.city)) = ${city}))
        AND l.id <> ${raw.excludeLeadId ?? ""}
      ORDER BY l."createdAt" DESC LIMIT 5`,
    db.$queryRaw<{ id: string; number: number; schoolName: string; city: string; ownerId: string; owner: string }[]>`
      SELECT c.id, c.number, c."schoolName", c.city, c."ownerId", u.name AS owner
      FROM "Client" c JOIN "User" u ON u.id = c."ownerId"
      WHERE regexp_replace(c.mobile, '[^0-9]', '', 'g') LIKE ${mobileLike}
         OR (lower(trim(c."schoolName")) = ${name} AND lower(trim(c.city)) = ${city})
      LIMIT 5`,
  ]);
  const seesAll = seesAllSales(user.role);
  return [
    ...clients.map((c): DuplicateMatch => ({
      kind: "Client",
      code: clientCode(c.number),
      schoolName: c.schoolName,
      city: c.city,
      owner: c.owner,
      status: "Client",
      href: seesAll || c.ownerId === user.id ? `/clients/${c.id}` : null,
    })),
    ...leads.map((l): DuplicateMatch => ({
      kind: "Lead",
      code: leadCode(l.number),
      schoolName: l.schoolName,
      city: l.city,
      owner: l.owner,
      status: LEAD_STATUS_LABEL[l.status as keyof typeof LEAD_STATUS_LABEL] ?? l.status,
      href: seesAll || l.assignedToId === user.id ? `/leads/${l.id}` : null,
    })),
  ];
}
