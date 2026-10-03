// Users, products and cities — managed by Directors and Admins.
import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { SALES_ROLES, canAssignOthers, canManageProducts, canManageSettings, type SessionUser } from "@/lib/permissions";
import { DomainError, NotFoundError } from "./errors";
import { cityInput, parse, productInput, stateInput, userInput } from "./validation";

function assertSettings(user: SessionUser) {
  if (!canManageSettings(user.role)) throw new DomainError("Only a Director or Admin can change settings.");
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function createUser(actor: SessionUser, raw: unknown) {
  assertSettings(actor);
  const d = parse(userInput, raw);
  if (d.role === "DIRECTOR" && actor.role !== "DIRECTOR") throw new DomainError("Only a Director can add a Director.");
  if (!d.password) throw new DomainError("Set an initial password.");
  try {
    const u = await db.user.create({
      data: {
        name: d.name,
        email: d.email,
        mobile: d.mobile,
        role: d.role,
        active: d.active,
        passwordHash: await bcrypt.hash(d.password, 12),
      },
    });
    return u.id;
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("A user with this email already exists.");
    throw e;
  }
}

export async function updateUser(actor: SessionUser, id: string, raw: unknown) {
  assertSettings(actor);
  const d = parse(userInput, raw);
  const target = await db.user.findUnique({ where: { id } });
  if (!target) throw new NotFoundError("User");
  if (actor.role !== "DIRECTOR" && (target.role === "DIRECTOR" || d.role === "DIRECTOR"))
    throw new DomainError("Only a Director can edit a Director or grant that role.");
  if (id === actor.id && (!d.active || d.role !== target.role))
    throw new DomainError("You can't deactivate yourself or change your own role.");
  try {
    await db.user.update({
      where: { id },
      data: {
        name: d.name,
        email: d.email,
        mobile: d.mobile,
        role: d.role,
        active: d.active,
        ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 12), failedLogins: 0, lockedUntil: null } : {}),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("A user with this email already exists.");
    throw e;
  }
}

export async function changeOwnPassword(actor: SessionUser, current: string, next: string) {
  if (!next || next.length < 8) throw new DomainError("New password must be at least 8 characters.");
  const u = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await bcrypt.compare(current ?? "", u.passwordHash))) throw new DomainError("Current password is incorrect.");
  await db.user.update({ where: { id: actor.id }, data: { passwordHash: await bcrypt.hash(next, 12) } });
}

export async function saveProduct(actor: SessionUser, id: string | null, raw: unknown) {
  if (!canManageProducts(actor.role)) throw new DomainError("Only a Director, Admin or the Sales Head can change products.");
  const d = parse(productInput, raw);
  const data = {
    name: d.name,
    category: d.category,
    price: d.price,
    mrp: d.mrp,
    gstRate: d.gstRate,
    active: d.active,
    contents: d.contents ?? Prisma.DbNull,
    color: d.color,
  };
  if (id) {
    await db.product.update({ where: { id }, data });
    return id;
  }
  // Kits (with contents) get K-codes like the class kits; anything else a P-code. Never reuse a code.
  const prefix = d.contents ? "K" : "P";
  const codes = await db.product.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
  const n = Math.max(0, ...codes.map((c) => Number(c.code.slice(1)) || 0)) + 1;
  const last = await db.product.aggregate({ _max: { sortOrder: true } });
  const p = await db.product.create({
    data: { ...data, code: `${prefix}${String(n).padStart(2, "0")}`, type: d.contents ? "MATERIAL" : "SERVICE", sortOrder: (last._max.sortOrder ?? 0) + 1 },
  });
  return p.id;
}

/** How many records mention a product, for the delete confirmation. */
export async function productUsage(id: string) {
  const [leads, opps, lines] = await Promise.all([
    db.leadInterest.count({ where: { productId: id } }),
    db.opportunityItem.count({ where: { productId: id } }),
    Promise.all([
      db.quotationItem.count({ where: { productId: id } }),
      db.salesOrderItem.count({ where: { productId: id } }),
      db.invoiceItem.count({ where: { productId: id } }),
    ]).then((n) => n.reduce((a, b) => a + b, 0)),
  ]);
  return { leads, opps, lines };
}

/**
 * Removes a product from the catalogue. Leads/opportunities lose the link; quotation,
 * order and invoice lines keep their own description and price, so documents are unchanged.
 */
export async function deleteProduct(actor: SessionUser, id: string) {
  if (!canManageProducts(actor.role)) throw new DomainError("Only a Director, Admin or the Sales Head can change products.");
  const p = await db.product.findUnique({ where: { id } });
  if (!p) throw new DomainError("This product was already deleted.");
  await db.$transaction([
    db.leadInterest.deleteMany({ where: { productId: id } }),
    db.opportunityItem.deleteMany({ where: { productId: id } }),
    db.quotationItem.updateMany({ where: { productId: id }, data: { productId: null } }),
    db.salesOrderItem.updateMany({ where: { productId: id }, data: { productId: null } }),
    db.invoiceItem.updateMany({ where: { productId: id }, data: { productId: null } }),
    db.product.delete({ where: { id } }),
  ]);
}

export async function addState(actor: SessionUser, raw: unknown) {
  assertSettings(actor);
  const d = parse(stateInput, raw);
  const existing = await db.state.findFirst({ where: { name: { equals: d.name, mode: "insensitive" } } });
  if (existing) {
    if (existing.active) throw new DomainError(`${existing.name} is already in the list.`);
    await db.state.update({ where: { id: existing.id }, data: { active: true } });
    return;
  }
  const last = await db.state.aggregate({ _max: { sortOrder: true } });
  await db.state.create({ data: { name: d.name, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
}

export async function setStateActive(actor: SessionUser, id: string, active: boolean) {
  assertSettings(actor);
  await db.state.update({ where: { id }, data: { active } });
}

export async function addCity(actor: SessionUser, raw: unknown) {
  assertSettings(actor);
  const d = parse(cityInput, raw);
  const state = await db.state.findUnique({ where: { name: d.stateName } });
  if (!state) throw new DomainError("Choose a state from the list.");
  const existing = await db.city.findFirst({
    where: { stateName: d.stateName, name: { equals: d.name, mode: "insensitive" } },
  });
  if (existing) {
    if (existing.active) throw new DomainError(`${existing.name} is already listed under ${d.stateName}.`);
    await db.city.update({ where: { id: existing.id }, data: { active: true } });
    return;
  }
  await db.city.create({ data: { stateName: d.stateName, name: d.name } });
}

export async function setCityActive(actor: SessionUser, id: string, active: boolean) {
  assertSettings(actor);
  await db.city.update({ where: { id }, data: { active } });
}

/** What a person currently has open, for the hand-over screen. */
export async function openWorkOf(userId: string) {
  const [leads, opportunities, clients, tasks] = await Promise.all([
    db.lead.count({ where: { assignedToId: userId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } }),
    db.opportunity.count({ where: { ownerId: userId, stage: { notIn: ["WON", "LOST"] } } }),
    db.client.count({ where: { ownerId: userId } }),
    db.task.count({ where: { assigneeId: userId, status: "OPEN" } }),
  ]);
  return { leads, opportunities, clients, tasks };
}

/** Moves someone's open leads, deals, clients and to-dos to a colleague (e.g. when they leave). */
export async function handOverWork(actor: SessionUser, fromId: string, toId: string) {
  if (!canAssignOthers(actor.role)) throw new DomainError("Only an Admin or the Sales Head can hand over work.");
  if (fromId === toId) throw new DomainError("Choose a different person to hand over to.");
  const [from, to] = await Promise.all([db.user.findUnique({ where: { id: fromId } }), db.user.findUnique({ where: { id: toId } })]);
  if (!from) throw new DomainError("User not found.");
  if (!to || !to.active || !SALES_ROLES.includes(to.role)) throw new DomainError("Hand over to an active member of the sales team.");
  return db.$transaction(async (tx) => {
    const leads = await tx.lead.updateMany({ where: { assignedToId: fromId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } }, data: { assignedToId: toId } });
    const opportunities = await tx.opportunity.updateMany({ where: { ownerId: fromId, stage: { notIn: ["WON", "LOST"] } }, data: { ownerId: toId } });
    const clientIds = (await tx.client.findMany({ where: { ownerId: fromId }, select: { id: true } })).map((c) => c.id);
    const clients = await tx.client.updateMany({ where: { ownerId: fromId }, data: { ownerId: toId } });
    const tasks = await tx.task.updateMany({ where: { assigneeId: fromId, status: "OPEN" }, data: { assigneeId: toId } });
    if (clientIds.length)
      await tx.activity.createMany({
        data: clientIds.map((clientId) => ({ type: "SYSTEM" as const, subject: `Account handed over from ${from.name} to ${to.name}`, byId: actor.id, clientId })),
      });
    return { leads: leads.count, opportunities: opportunities.count, clients: clients.count, tasks: tasks.count };
  });
}
