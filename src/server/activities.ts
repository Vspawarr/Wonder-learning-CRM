import { db } from "@/lib/db";
import { CLOSED_STAGES } from "@/lib/constants";
import { toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { leadScope, oppScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { isActiveLead, taskTypeForActivity } from "./rules";
import { activityInput, parse } from "./validation";

/** Logs a call, message, meeting or note against a lead or opportunity. */
export async function logActivity(user: SessionUser, raw: unknown) {
  const d = parse(activityInput, raw);
  return db.$transaction(async (tx) => {
    let ownerId: string;
    let leadId: string | null = null;
    let leadStatus: string | null = null;
    if (d.leadId) {
      const lead = await tx.lead.findFirst({ where: { id: d.leadId, ...leadScope(user) } });
      if (!lead) throw new NotFoundError("Lead");
      if (d.followUpDate && !isActiveLead(lead.status))
        throw new DomainError("Follow-ups can only be booked on an active lead.");
      ownerId = lead.assignedToId;
      leadId = lead.id;
      leadStatus = lead.status;
    } else {
      const opp = await tx.opportunity.findFirst({ where: { id: d.opportunityId!, ...oppScope(user) } });
      if (!opp) throw new NotFoundError("Opportunity");
      if (d.followUpDate && CLOSED_STAGES.includes(opp.stage))
        throw new DomainError("Follow-ups can't be booked on a closed deal.");
      ownerId = opp.ownerId;
    }

    await tx.activity.create({
      data: {
        type: d.type,
        subject: d.subject || d.type.replace("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        summary: d.summary,
        nextAction: d.nextAction,
        byId: user.id,
        leadId,
        opportunityId: d.opportunityId || null,
      },
    });

    if (d.followUpDate) {
      await tx.task.create({
        data: {
          type: taskTypeForActivity(d.type),
          title: d.nextAction || "Follow up",
          dueDate: toDbDate(d.followUpDate),
          priority: "MEDIUM",
          assigneeId: ownerId,
          createdById: user.id,
          leadId,
          opportunityId: d.opportunityId || null,
        },
      });
      if (leadId) await tx.lead.update({ where: { id: leadId }, data: { nextFollowUpDate: toDbDate(d.followUpDate) } });
      else
        await tx.opportunity.update({
          where: { id: d.opportunityId! },
          data: { nextAction: d.nextAction, nextActionDate: toDbDate(d.followUpDate) },
        });
    }
    if (leadId && leadStatus === "NEW") await tx.lead.update({ where: { id: leadId }, data: { status: "CONTACTED" } });
  });
}
