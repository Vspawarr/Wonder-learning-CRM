import { db } from "@/lib/db";
import { clientCode } from "@/lib/constants";
import { addDays, todayIST, toDbDate } from "@/lib/dates";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { assertAssignable, clientScope, oppScope } from "./access";
import { assertLocation } from "./locations";
import { clientInput, parse } from "./validation";
import { DomainError, NotFoundError } from "./errors";

/** Turns a won opportunity into a client and starts onboarding. Returns the client id. */
export async function convertToClient(user: SessionUser, opportunityId: string) {
  return db.$transaction(async (tx) => {
    const opp = await tx.opportunity.findFirst({
      where: { id: opportunityId, ...oppScope(user) },
      include: { lead: true, client: { select: { id: true } } },
    });
    if (!opp) throw new NotFoundError("Opportunity");
    if (opp.stage !== "WON") throw new DomainError("Only a won deal can be converted to a client.");
    if (opp.client) throw new DomainError("This deal is already a client.");
    if (opp.renewalOfId) throw new DomainError("This is a renewal of an existing client; create its sales order on the client page.");
    const lead = opp.lead;
    if (!lead) throw new DomainError("This deal has no lead details to create the client from.");

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
    await tx.client.update({ where: { id }, data: { ...details, ownerId } });
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
