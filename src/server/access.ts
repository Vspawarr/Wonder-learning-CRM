// The only place record-level visibility is decided. Every query and
// mutation on leads, opportunities and tasks merges one of these filters.
import type { Prisma } from "@/generated/prisma/client";
import { canAssignOthers, canManageSettings, SALES_ROLES, seesAllSales, type SessionUser } from "@/lib/permissions";
import type { Db } from "@/lib/db";
import { DomainError } from "./errors";

/**
 * R60: leads of former staff (salespeople in old records with no CRM login) are seen by Admin / Director only, until
 * they are transferred to a current salesperson. The Sales Head sees every other lead.
 */
export const leadScope = (u: SessionUser): Prisma.LeadWhereInput =>
  canManageSettings(u.role) ? {} : seesAllSales(u.role) ? { assignedTo: { formerStaff: false } } : { assignedToId: u.id };

export const oppScope = (u: SessionUser): Prisma.OpportunityWhereInput => (seesAllSales(u.role) ? {} : { ownerId: u.id });

export const taskScope = (u: SessionUser): Prisma.TaskWhereInput => (seesAllSales(u.role) ? {} : { assigneeId: u.id });

export const clientScope = (u: SessionUser): Prisma.ClientWhereInput => (seesAllSales(u.role) ? {} : { ownerId: u.id });

export const activityScope = (u: SessionUser): Prisma.ActivityWhereInput =>
  canManageSettings(u.role)
    ? {}
    : seesAllSales(u.role)
    ? { NOT: { lead: { is: { assignedTo: { is: { formerStaff: true } } } } } }
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
