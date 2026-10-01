// Users, products and cities — managed by Directors and Admins.
import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { canManageProducts, canManageSettings, type SessionUser } from "@/lib/permissions";
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
        ...(d.password ? { passwordHash: await bcrypt.hash(d.password, 12) } : {}),
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
  const data = { name: d.name, category: d.category, price: d.price, gstRate: d.gstRate, active: d.active };
  if (id) {
    await db.product.update({ where: { id }, data });
    return id;
  }
  const count = await db.product.count({ where: { type: "SERVICE" } });
  let n = count + 1;
  while (await db.product.findUnique({ where: { code: `P${String(n).padStart(2, "0")}` } })) n++;
  const p = await db.product.create({
    data: { ...data, code: `P${String(n).padStart(2, "0")}`, type: "SERVICE", sortOrder: n },
  });
  return p.id;
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
