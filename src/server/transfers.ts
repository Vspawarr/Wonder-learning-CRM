// R43: moving a lead or a client to another salesperson. Anyone who can see the record can ask; the Sales Head,
// Admin or Director approves (their own transfers apply at once). On approval the record, its open deal(s) and
// open to-dos move to the new salesperson.
import { z } from "zod";
import { db, type Db } from "@/lib/db";
import { clientCode, leadCode } from "@/lib/constants";
import { addDays, toDbDate, todayIST } from "@/lib/dates";
import { SALES_ROLES, canApproveTransfers, type SessionUser } from "@/lib/permissions";
import { clientScope, leadScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { getFeatures } from "./features";
import { parse } from "./validation";

const requestInput = z.object({
  kind: z.enum(["lead", "client"]),
  id: z.string().min(1),
  toUserId: z.string().min(1, "Choose who it goes to."),
  reason: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((s) => s || null),
});

type Target = { kind: "lead" | "client"; id: string; school: string; code: string; ownerId: string };

async function loadTarget(tx: Db, user: SessionUser | null, kind: "lead" | "client", id: string): Promise<Target> {
  if (kind === "lead") {
    const l = await tx.lead.findFirst({ where: { id, ...(user ? leadScope(user) : {}) }, select: { id: true, number: true, schoolName: true, assignedToId: true } });
    if (!l) throw new NotFoundError("Lead");
    return { kind, id, school: l.schoolName, code: leadCode(l.number), ownerId: l.assignedToId };
  }
  const c = await tx.client.findFirst({ where: { id, ...(user ? clientScope(user) : {}) }, select: { id: true, number: true, schoolName: true, ownerId: true } });
  if (!c) throw new NotFoundError("Client");
  return { kind, id, school: c.schoolName, code: clientCode(c.number), ownerId: c.ownerId };
}

/** Moves the record, its open deals and open to-dos. */
async function apply(tx: Db, actor: SessionUser, t: Target, toId: string, note: string) {
  const to = await tx.user.findUniqueOrThrow({ where: { id: toId }, select: { name: true } });
  const from = await tx.user.findUniqueOrThrow({ where: { id: t.ownerId }, select: { name: true } });
  const subject = `Transferred from ${from.name} to ${to.name}${note}`;
  if (t.kind === "lead") {
    await tx.lead.update({ where: { id: t.id }, data: { assignedToId: toId } });
    await tx.task.updateMany({ where: { leadId: t.id, status: "OPEN" }, data: { assigneeId: toId } });
    const opps = await tx.opportunity.findMany({ where: { leadId: t.id, stage: { notIn: ["WON", "LOST"] } }, select: { id: true } });
    if (opps.length) {
      await tx.opportunity.updateMany({ where: { id: { in: opps.map((o) => o.id) } }, data: { ownerId: toId } });
      await tx.task.updateMany({ where: { opportunityId: { in: opps.map((o) => o.id) }, status: "OPEN" }, data: { assigneeId: toId } });
    }
    await tx.activity.create({ data: { type: "SYSTEM", subject, byId: actor.id, leadId: t.id } });
  } else {
    await tx.client.update({ where: { id: t.id }, data: { ownerId: toId } });
    await tx.task.updateMany({ where: { clientId: t.id, status: "OPEN" }, data: { assigneeId: toId } });
    const renewals = await tx.opportunity.findMany({ where: { renewalOfId: t.id, stage: { notIn: ["WON", "LOST"] } }, select: { id: true } });
    if (renewals.length) {
      await tx.opportunity.updateMany({ where: { id: { in: renewals.map((o) => o.id) } }, data: { ownerId: toId } });
      await tx.task.updateMany({ where: { opportunityId: { in: renewals.map((o) => o.id) }, status: "OPEN" }, data: { assigneeId: toId } });
    }
    await tx.activity.create({ data: { type: "SYSTEM", subject, byId: actor.id, clientId: t.id } });
  }
  // The new salesperson hears about it on their to-do list.
  await tx.task.create({
    data: {
      type: "Call",
      title: `Taken over: ${t.school} (${t.code}) from ${from.name}`,
      remark: "Introduce yourself to the school and check the open follow-ups.",
      dueDate: toDbDate(addDays(todayIST(), 1)),
      priority: "MEDIUM",
      isAuto: true,
      assigneeId: toId,
      createdById: actor.id,
      ...(t.kind === "lead" ? { leadId: t.id } : { clientId: t.id }),
    },
  });
}

/** Ask to move a lead or client. Returns whether it moved straight away (the approver's own request). */
export async function requestTransfer(user: SessionUser, raw: unknown) {
  if (!(await getFeatures()).transfers) throw new DomainError("Transfers are switched off in Settings → Features.");
  const d = parse(requestInput, raw);
  return db.$transaction(async (tx) => {
    const t = await loadTarget(tx, user, d.kind, d.id);
    if (d.toUserId === t.ownerId) throw new DomainError("It's already with that salesperson.");
    const to = await tx.user.findUnique({ where: { id: d.toUserId }, select: { active: true, role: true } });
    if (!to?.active || !SALES_ROLES.includes(to.role)) throw new DomainError("Choose an active member of the sales team.");
    const open = await tx.ownerTransfer.count({ where: { status: "PENDING", ...(d.kind === "lead" ? { leadId: d.id } : { clientId: d.id }) } });
    if (open) throw new DomainError("A transfer of this record is already waiting for approval.");
    const direct = canApproveTransfers(user.role);
    if (!direct && (!d.reason || d.reason.length < 3)) throw new DomainError("Write why it should move (for the approver).");
    await tx.ownerTransfer.create({
      data: {
        ...(d.kind === "lead" ? { leadId: d.id } : { clientId: d.id }),
        fromUserId: t.ownerId,
        toUserId: d.toUserId,
        reason: d.reason,
        requestedById: user.id,
        ...(direct ? { status: "APPROVED" as const, decidedById: user.id, decidedAt: new Date() } : {}),
      },
    });
    if (direct) await apply(tx, user, t, d.toUserId, d.reason ? ` · ${d.reason}` : "");
    else
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          subject: `Transfer requested by ${user.name}: waiting for approval`,
          summary: d.reason,
          byId: user.id,
          ...(d.kind === "lead" ? { leadId: d.id } : { clientId: d.id }),
        },
      });
    return { moved: direct };
  });
}

const decideInput = z.object({ approve: z.boolean(), reason: z.string().trim().max(300).nullish() });

/** Sales Head / Admin / Director approve or reject a waiting transfer. */
export async function decideTransfer(user: SessionUser, id: string, raw: unknown) {
  if (!canApproveTransfers(user.role)) throw new DomainError("Transfers are approved by the Sales Head or Admin.");
  const d = parse(decideInput, raw);
  if (!d.approve && (!d.reason || d.reason.length < 3)) throw new DomainError("Write why it is rejected.");
  return db.$transaction(async (tx) => {
    const r = await tx.ownerTransfer.findUnique({ where: { id }, include: { toUser: { select: { name: true, active: true } } } });
    if (!r || r.status !== "PENDING") throw new DomainError("This transfer is no longer waiting for approval.");
    const t = await loadTarget(tx, null, r.leadId ? "lead" : "client", (r.leadId ?? r.clientId)!);
    if (d.approve) {
      if (!r.toUser.active) throw new DomainError(`${r.toUser.name} is no longer active; reject this request.`);
      await tx.ownerTransfer.update({ where: { id }, data: { status: "APPROVED", decidedById: user.id, decidedAt: new Date() } });
      if (t.ownerId !== r.toUserId) await apply(tx, user, t, r.toUserId, ` · approved by ${user.name}`);
    } else {
      await tx.ownerTransfer.update({ where: { id }, data: { status: "REJECTED", decidedById: user.id, decidedAt: new Date(), rejectReason: d.reason } });
      await tx.task.create({
        data: {
          type: "Other",
          title: `Transfer of ${t.school} to ${r.toUser.name} rejected: ${d.reason}`,
          dueDate: toDbDate(todayIST()),
          priority: "MEDIUM",
          isAuto: true,
          assigneeId: r.requestedById,
          createdById: user.id,
          ...(t.kind === "lead" ? { leadId: t.id } : { clientId: t.id }),
        },
      });
      await tx.activity.create({
        data: { type: "SYSTEM", subject: `Transfer to ${r.toUser.name} rejected by ${user.name}`, summary: d.reason, byId: user.id, ...(t.kind === "lead" ? { leadId: t.id } : { clientId: t.id }) },
      });
    }
  });
}

/** Withdraw your own waiting request. */
export async function cancelTransfer(user: SessionUser, id: string) {
  const r = await db.ownerTransfer.findUnique({ where: { id } });
  if (!r || r.status !== "PENDING") throw new DomainError("This transfer is no longer waiting.");
  if (r.requestedById !== user.id && !canApproveTransfers(user.role)) throw new DomainError("Only the person who asked can withdraw it.");
  await db.ownerTransfer.delete({ where: { id } });
}

const rowInclude = {
  lead: { select: { id: true, number: true, schoolName: true, city: true } },
  client: { select: { id: true, number: true, schoolName: true, city: true } },
  fromUser: { select: { name: true } },
  toUser: { select: { name: true } },
  requestedBy: { select: { name: true } },
  decidedBy: { select: { name: true } },
} as const;

function row(r: Awaited<ReturnType<typeof db.ownerTransfer.findMany<{ include: typeof rowInclude }>>>[number]) {
  const lead = r.lead;
  const client = r.client;
  return {
    id: r.id,
    kind: lead ? ("Lead" as const) : ("Client" as const),
    code: lead ? leadCode(lead.number) : client ? clientCode(client.number) : "",
    school: lead?.schoolName ?? client?.schoolName ?? "",
    city: lead?.city ?? client?.city ?? "",
    href: lead ? `/leads/${lead.id}` : client ? `/clients/${client.id}` : "#",
    from: r.fromUser.name,
    to: r.toUser.name,
    reason: r.reason,
    status: r.status,
    requestedBy: r.requestedBy.name,
    requestedAt: r.createdAt.toISOString(),
    decidedBy: r.decidedBy?.name ?? null,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    rejectReason: r.rejectReason,
  };
}
export type TransferRow = ReturnType<typeof row>;

/** Approvers: everything waiting, and decisions of the last 30 days. Others: their own requests. */
export async function transferList(user: SessionUser) {
  const mine = canApproveTransfers(user.role) ? {} : { requestedById: user.id };
  const since = new Date(Date.now() - 30 * 86400e3);
  const [waiting, decided] = await Promise.all([
    db.ownerTransfer.findMany({ where: { ...mine, status: "PENDING" }, include: rowInclude, orderBy: { createdAt: "asc" } }),
    db.ownerTransfer.findMany({ where: { ...mine, status: { not: "PENDING" }, decidedAt: { gte: since } }, include: rowInclude, orderBy: { decidedAt: "desc" } }),
  ]);
  return { waiting: waiting.map(row), decided: decided.map(row) };
}

/** The waiting request on one lead / client, if any (shown on its page). */
export async function pendingTransferFor(kind: "lead" | "client", id: string) {
  const r = await db.ownerTransfer.findFirst({ where: { status: "PENDING", ...(kind === "lead" ? { leadId: id } : { clientId: id }) }, include: rowInclude });
  return r ? row(r) : null;
}

export async function pendingTransferCount(user: SessionUser) {
  return canApproveTransfers(user.role) ? db.ownerTransfer.count({ where: { status: "PENDING" } }) : 0;
}

/** Everyone who can receive sales work. */
export async function salesTeam() {
  return db.user.findMany({ where: { active: true, role: { in: [...SALES_ROLES] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
