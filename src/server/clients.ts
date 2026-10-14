import { db } from "@/lib/db";
import { STAGE_LABEL, STAGE_PROBABILITY, clientCode } from "@/lib/constants";
import { addDays, todayIST, toDbDate } from "@/lib/dates";
import { canManageSettings, seesAllSales, type SessionUser } from "@/lib/permissions";
import { assertAssignable, clientScope, oppScope } from "./access";
import { assertLocation } from "./locations";
import { clientInput, parse } from "./validation";
import { syncSchool } from "./school";
import { DomainError, NotFoundError } from "./errors";

/** Turns an opportunity into a client (marking it Won if still open) and starts onboarding. Returns the client id. */
export async function convertToClient(user: SessionUser, opportunityId: string) {
  return db.$transaction(async (tx) => {
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, ...oppScope(user) },
      include: { lead: true, client: { select: { id: true } } },
    });
    if (!opp) throw new NotFoundError("Opportunity");
    if (opp.stage === "LOST") throw new DomainError("This deal is lost; it can't become a client.");
    if (opp.client) throw new DomainError("This deal is already a client.");
    if (opp.renewalOfId) throw new DomainError("This is a renewal of an existing client; create its sales order on the client page.");
    const lead = opp.lead;
    if (!lead) throw new DomainError("This deal has no lead details to create the client from.");

    // R43: converting is enough; an open deal is marked Won on the way (no need to set the stage first).
    if (opp.stage !== "WON") {
      const now = new Date();
      await tx.opportunity.update({ where: { id: opp.id }, data: { stage: "WON", probability: STAGE_PROBABILITY.WON, closedAt: now } });
      await tx.opportunityStageChange.create({ data: { opportunityId: opp.id, fromStage: opp.stage, toStage: "WON", changedById: user.id } });
      await tx.task.updateMany({ where: { opportunityId: opp.id, status: "OPEN" }, data: { status: "CANCELLED", outcome: "Deal won", completedAt: now } });
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          subject: `Stage: ${STAGE_LABEL[opp.stage]} → ${STAGE_LABEL.WON} (converted to client)`,
          byId: user.id,
          opportunityId: opp.id,
          leadId: opp.leadId,
        },
      });
    }

    const client = await tx.client.create({
      data: {
        opportunityId: opp.id,
        schoolName: opp.schoolName,
        contactName: lead.contactName,
        designation: lead.designation,
        mobile: lead.mobile,
        email: lead.email,
        state: lead.state,
        city: lead.city,
        area: lead.area,
        address: lead.address,
        currentCurriculum: lead.currentCurriculum,
        studentStrength: lead.studentStrength,
        branches: lead.branches,
        ownerId: opp.ownerId,
        createdById: user.id,
      },
    });
    await tx.task.create({
      data: {
        type: "Call",
        title: `Start onboarding: ${opp.schoolName}`,
        remark: "Welcome call, collect documents and plan the setup.",
        dueDate: toDbDate(addDays(todayIST(), 1)),
        priority: "HIGH",
        isAuto: true,
        assigneeId: opp.ownerId,
        createdById: user.id,
        clientId: client.id,
      },
    });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Converted to client ${clientCode(client.number)} · onboarding started`,
        byId: user.id,
        clientId: client.id,
        opportunityId: opp.id,
        leadId: lead.id,
      },
    });
    return client.id;
  });
}

export async function completeOnboarding(user: SessionUser, clientId: string) {
  return db.$transaction(async (tx) => {
    const client = await tx.client.findFirst({
      where: { id: clientId, ...clientScope(user) },
    });
    if (!client) throw new NotFoundError("Client");
    if (client.status !== "ONBOARDING") throw new DomainError("Onboarding is already complete.");
    await tx.client.update({
      where: { id: clientId },
      data: { status: "ACTIVE", onboardingCompletedAt: new Date() },
    });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: "Onboarding completed",
        byId: user.id,
        clientId,
      },
    });
  });
}

const FIELD_LABEL: Record<string, string> = {
  schoolName: "School name",
  contactName: "Contact",
  designation: "Designation",
  mobile: "Mobile",
  email: "Email",
  state: "State",
  city: "City",
  area: "Area",
  address: "Address",
  currentCurriculum: "Curriculum",
  studentStrength: "Student strength",
  branches: "Branches",
};

/** Edits a client's details. Changing the account owner is for Directors, Admins and the Sales Head. */
export async function updateClient(user: SessionUser, id: string, raw: unknown) {
  const d = parse(clientInput, raw);
  return db.$transaction(async (tx) => {
    const c = await tx.client.findFirst({
      where: { id, ...clientScope(user) },
    });
    if (!c) throw new NotFoundError("Client");
    await assertLocation(tx, d.state, d.city, c);
    const { ownerId, ...details } = d;
    const ownerChanged = ownerId !== c.ownerId;
    if (ownerChanged) {
      if (!seesAllSales(user.role)) throw new DomainError("Only an Admin or the Sales Head can change the assigned salesperson.");
      await assertAssignable(tx, user, ownerId);
    }
    const changed = Object.keys(FIELD_LABEL).filter((k) => (details as Record<string, unknown>)[k] !== (c as Record<string, unknown>)[k]);
    await tx.client.update({ where: { id }, data: { ownerId } });
    // The school's details are corrected on its lead, opportunities and draft quotations too (R35).
    await syncSchool(tx, { clientId: id }, details);
    const notes = changed.length ? [`Details updated: ${changed.map((k) => FIELD_LABEL[k]).join(", ")}`] : [];
    if (ownerChanged) {
      const to = await tx.user.findUniqueOrThrow({
        where: { id: ownerId },
        select: { name: true },
      });
      notes.push(`Assigned salesperson changed to ${to.name}`);
      // Their open follow-ups (incl. payment collection) move with the account.
      await tx.task.updateMany({
        where: { clientId: id, status: "OPEN", assigneeId: c.ownerId },
        data: { assigneeId: ownerId },
      });
    }
    if (notes.length)
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          subject: notes.join(" · "),
          byId: user.id,
          clientId: id,
        },
      });
  });
}

/**
 * R43: undo a conversion made by mistake (Admin / Director only). The client goes, its history and quotations move back
 * to the deal, and the deal reopens at the stage it had before Won. The lead stays as it is. Refused once orders,
 * invoices or payments exist (those are real business and must be cancelled first).
 */
export async function removeClient(user: SessionUser, clientId: string, reason: string) {
  if (!canManageSettings(user.role)) throw new DomainError("Only an Admin or the Director can remove a client.");
  if (!reason || reason.trim().length < 3) throw new DomainError("Write why the client is being removed.");
  return db.$transaction(async (tx) => {
    const c = await tx.client.findUnique({
      where: { id: clientId },
      include: { _count: { select: { salesOrders: true, invoices: true, payments: true, creditNotes: true, dispatches: true, renewals: true } } },
    });
    if (!c) throw new NotFoundError("Client");
    const n = c._count;
    const blockers = [
      n.salesOrders && `${n.salesOrders} sales order(s)`,
      n.invoices && `${n.invoices} invoice(s)`,
      n.payments && `${n.payments} payment(s)`,
      n.creditNotes && `${n.creditNotes} credit note(s)`,
      n.dispatches && `${n.dispatches} dispatch(es)`,
      n.renewals && `${n.renewals} renewal deal(s)`,
    ].filter(Boolean);
    if (blockers.length) throw new DomainError(`This client already has ${blockers.join(", ")}. Only a client without orders, invoices or payments can be removed.`);

    // Keep the history and quotations on the deal.
    await tx.activity.updateMany({ where: { clientId, opportunityId: null }, data: { opportunityId: c.opportunityId } });
    await tx.activity.updateMany({ where: { clientId }, data: { clientId: null } });
    await tx.quotation.updateMany({ where: { clientId, opportunityId: null }, data: { opportunityId: c.opportunityId } });
    await tx.quotation.updateMany({ where: { clientId }, data: { clientId: null } });

    // Reopen the deal where it was before it was won.
    const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: c.opportunityId } });
    const lastWon = await tx.opportunityStageChange.findFirst({ where: { opportunityId: opp.id, toStage: "WON" }, orderBy: { changedAt: "desc" } });
    const back = lastWon?.fromStage && lastWon.fromStage !== "WON" && lastWon.fromStage !== "LOST" ? lastWon.fromStage : "NEGOTIATION";
    await tx.opportunity.update({ where: { id: opp.id }, data: { stage: back, probability: STAGE_PROBABILITY[back], closedAt: null } });
    await tx.opportunityStageChange.create({ data: { opportunityId: opp.id, fromStage: opp.stage, toStage: back, changedById: user.id } });
    await tx.client.delete({ where: { id: clientId } });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject: `Client ${clientCode(c.number)} removed by ${user.name}; deal reopened at ${STAGE_LABEL[back]}`,
        summary: reason.trim(),
        byId: user.id,
        opportunityId: opp.id,
        leadId: opp.leadId,
      },
    });
    return opp.id;
  });
}
