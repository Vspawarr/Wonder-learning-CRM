import { db } from "@/lib/db";
import { toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { assertTaskAssignable, clientScope, leadScope, oppScope, taskScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { activityTypeForTask, isActiveLead } from "./rules";
import { completeTaskInput, parse, taskInput } from "./validation";

export async function createTask(user: SessionUser, raw: unknown) {
  const d = parse(taskInput, raw);
  return db.$transaction(async (tx) => {
    await assertTaskAssignable(tx, user, d.assigneeId);
    if (d.leadId && !(await tx.lead.findFirst({ where: { id: d.leadId, ...leadScope(user) }, select: { id: true } })))
      throw new NotFoundError("Lead");
    if (
      d.opportunityId &&
      !(await tx.opportunity.findFirst({ where: { id: d.opportunityId, ...oppScope(user) }, select: { id: true } }))
    )
      throw new NotFoundError("Opportunity");
    if (d.clientId && !(await tx.client.findFirst({ where: { id: d.clientId, ...clientScope(user) }, select: { id: true } })))
      throw new NotFoundError("Client");
    const task = await tx.task.create({
      data: {
        title: d.title,
        type: d.type,
        dueDate: toDbDate(d.dueDate),
        priority: d.priority,
        remark: d.remark,
        assigneeId: d.assigneeId,
        createdById: user.id,
        leadId: d.leadId || null,
        opportunityId: d.opportunityId || null,
        clientId: d.clientId || null,
      },
    });
    return task.id;
  });
}

/** Marks a task done, logs what happened and optionally books the next follow-up. */
export async function completeTask(user: SessionUser, id: string, raw: unknown) {
  const d = parse(completeTaskInput, raw);
  return db.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id, ...taskScope(user) },
      include: { lead: { select: { status: true } }, opportunity: { select: { stage: true } } },
    });
    if (!task) throw new NotFoundError("Task");
    if (task.status !== "OPEN") throw new DomainError("This task is already closed.");

    await tx.task.update({
      where: { id },
      data: { status: "DONE", outcome: d.outcome, completedAt: new Date() },
    });

    if (task.leadId || task.opportunityId || task.clientId)
      await tx.activity.create({
        data: {
          type: activityTypeForTask(task.type),
          subject: task.title,
          summary: d.outcome || "Completed.",
          byId: user.id,
          leadId: task.leadId,
          opportunityId: task.opportunityId,
          clientId: task.clientId,
        },
      });

    if (d.nextDate)
      await tx.task.create({
        data: {
          type: task.type,
          // A payment-collection follow-up stays tied to its invoice (its title tracks the balance).
          title: task.invoiceId || task.title.startsWith("Follow up: ") ? task.title : `Follow up: ${task.title}`,
          dueDate: toDbDate(d.nextDate),
          priority: task.priority,
          assigneeId: task.assigneeId,
          createdById: user.id,
          leadId: task.leadId,
          opportunityId: task.opportunityId,
          clientId: task.clientId,
          invoiceId: task.invoiceId,
          isAuto: !!task.invoiceId,
        },
      });

    // An active lead's "next follow-up" is its earliest open task.
    if (task.leadId && task.lead && isActiveLead(task.lead.status)) {
      const next = await tx.task.findFirst({
        where: { leadId: task.leadId, status: "OPEN" },
        orderBy: { dueDate: "asc" },
        select: { dueDate: true, type: true },
      });
      await tx.lead.update({
        where: { id: task.leadId },
        data: next ? { nextFollowUpDate: next.dueDate, followUpType: next.type } : { nextFollowUpDate: null },
      });
    }
    if (task.opportunityId && d.nextDate)
      await tx.opportunity.update({
        where: { id: task.opportunityId },
        data: { nextActionDate: toDbDate(d.nextDate) },
      });

    // First contact moves a new lead on.
    if (task.leadId && task.lead?.status === "NEW")
      await tx.lead.update({ where: { id: task.leadId }, data: { status: "CONTACTED" } });
  });
}
