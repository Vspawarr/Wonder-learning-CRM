import { db, type Tx } from "@/lib/db";
import { todayIST, toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { assertTaskAssignable, clientScope, leadScope, oppScope, taskScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { activityTypeForTask, isActiveLead } from "./rules";
import { cancelTaskInput, completeTaskInput, parse, postponeTaskInput, taskInput } from "./validation";

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
        dueTime: d.dueTime,
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

    if (task.leadId && task.lead && isActiveLead(task.lead.status)) await syncLeadFollowUp(tx, task.leadId);
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

/** An active lead's "next follow-up" is its earliest open task. */
async function syncLeadFollowUp(tx: Tx, leadId: string) {
  const next = await tx.task.findFirst({
    where: { leadId, status: "OPEN" },
    orderBy: { dueDate: "asc" },
    select: { dueDate: true, type: true },
  });
  await tx.lead.update({
    where: { id: leadId },
    data: next ? { nextFollowUpDate: next.dueDate, followUpType: next.type } : { nextFollowUpDate: null },
  });
}

async function loadOpenTask(tx: Tx, user: SessionUser, id: string) {
  const task = await tx.task.findFirst({ where: { id, ...taskScope(user) }, include: { lead: { select: { status: true } } } });
  if (!task) throw new NotFoundError("Task");
  if (task.status !== "OPEN") throw new DomainError("This task is already closed.");
  return task;
}

const dmy = (s: string) => s.split("-").reverse().join("/");

/** Moves a task to a later date (and time), keeping count of how often it slipped. */
export async function postponeTask(user: SessionUser, id: string, raw: unknown) {
  const d = parse(postponeTaskInput, raw);
  if (d.dueDate < todayIST()) throw new DomainError("Choose today or a later date.");
  return db.$transaction(async (tx) => {
    const task = await loadOpenTask(tx, user, id);
    await tx.task.update({
      where: { id },
      data: {
        dueDate: toDbDate(d.dueDate),
        dueTime: d.dueTime,
        postponedCount: { increment: 1 },
        postponeReason: d.reason,
      },
    });
    if (task.leadId || task.opportunityId || task.clientId)
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          subject: `Postponed to ${dmy(d.dueDate)}: ${task.title}`,
          summary: d.reason,
          byId: user.id,
          leadId: task.leadId,
          opportunityId: task.opportunityId,
          clientId: task.clientId,
        },
      });
    if (task.leadId && task.lead && isActiveLead(task.lead.status)) await syncLeadFollowUp(tx, task.leadId);
  });
}

/** Drops a task that is no longer needed. */
export async function cancelTask(user: SessionUser, id: string, raw: unknown) {
  const d = parse(cancelTaskInput, raw);
  return db.$transaction(async (tx) => {
    const task = await loadOpenTask(tx, user, id);
    await tx.task.update({ where: { id }, data: { status: "CANCELLED", outcome: d.reason ?? "Cancelled", completedAt: new Date() } });
    if (task.leadId || task.opportunityId || task.clientId)
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          subject: `Cancelled: ${task.title}`,
          summary: d.reason,
          byId: user.id,
          leadId: task.leadId,
          opportunityId: task.opportunityId,
          clientId: task.clientId,
        },
      });
    if (task.leadId && task.lead && isActiveLead(task.lead.status)) await syncLeadFollowUp(tx, task.leadId);
  });
}
