import { db } from "@/lib/db";
import { clientCode } from "@/lib/constants";
import { addDays, todayIST, toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { clientScope, oppScope } from "./access";
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
    const client = await tx.client.findFirst({ where: { id: clientId, ...clientScope(user) } });
    if (!client) throw new NotFoundError("Client");
    if (client.status !== "ONBOARDING") throw new DomainError("Onboarding is already complete.");
    await tx.client.update({ where: { id: clientId }, data: { status: "ACTIVE", onboardingCompletedAt: new Date() } });
    await tx.activity.create({ data: { type: "SYSTEM", subject: "Onboarding completed", byId: user.id, clientId } });
  });
}
