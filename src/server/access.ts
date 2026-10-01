// The only place record-level visibility is decided. Every query and
// mutation on leads, opportunities and tasks merges one of these filters.
import type { Prisma } from "@/generated/prisma/client";
import { canAssignOthers, SALES_ROLES, seesAllSales, type SessionUser } from "@/lib/permissions";
import type { Db } from "@/lib/db";
import { DomainError } from "./errors";

export const leadScope = (u: SessionUser): Prisma.LeadWhereInput => (seesAllSales(u.role) ? {} : { assignedToId: u.id });

export const oppScope = (u: SessionUser): Prisma.OpportunityWhereInput => (seesAllSales(u.role) ? {} : { ownerId: u.id });

export const taskScope = (u: SessionUser): Prisma.TaskWhereInput => (seesAllSales(u.role) ? {} : { assigneeId: u.id });

export const clientScope = (u: SessionUser): Prisma.ClientWhereInput => (seesAllSales(u.role) ? {} : { ownerId: u.id });

export const activityScope = (u: SessionUser): Prisma.ActivityWhereInput =>
    seesAllSales(u.role)
    ? {}
    : { OR: [{ lead: { assignedToId: u.id } }, { opportunity: { ownerId: u.id } }, { client: { ownerId: u.id } }] };

/** Check that `actor` may give sales work to `assigneeId`, and that the assignee can own it. */
export async function assertAssignable(db: Db, actor: SessionUser, assigneeId: string) {
  if (!canAssignOthers(actor.role) && assigneeId !== actor.id)
    throw new DomainError("You can only assign work to yourself.");
  const u = await db.user.findUnique({ where: { id: assigneeId }, select: { active: true, role: true } });
  if (!u || !u.active) throw new DomainError("Choose an active team member.");
  if (!SALES_ROLES.includes(u.role)) throw new DomainError("Sales work can only be assigned to the sales team.");
}

/** Anyone may be given a task; Sales Executives only themselves. */
export async function assertTaskAssignable(db: Db, actor: SessionUser, assigneeId: string) {
  if (!canAssignOthers(actor.role) && assigneeId !== actor.id)
    throw new DomainError("You can only assign tasks to yourself.");
  const u = await db.user.findUnique({ where: { id: assigneeId }, select: { active: true } });
  if (!u || !u.active) throw new DomainError("Choose an active team member.");
}
