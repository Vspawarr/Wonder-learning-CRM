import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/permissions";
import { addDays, todayIST } from "@/lib/dates";
import type { LeadInput } from "@/server/validation";

export async function resetData() {
  await db.$transaction([
    db.activity.deleteMany(),
    db.task.deleteMany(),
    db.client.deleteMany(),
    db.opportunityStageChange.deleteMany(),
    db.opportunityItem.deleteMany(),
    db.opportunity.deleteMany(),
    db.leadInterest.deleteMany(),
    db.lead.deleteMany(),
    db.product.deleteMany(),
    db.city.deleteMany(),
    db.user.deleteMany(),
  ]);
  // Leads need a listed state + city (Settings → Locations).
  await db.state.upsert({ where: { name: "Maharashtra" }, update: { active: true }, create: { name: "Maharashtra" } });
  await db.city.create({ data: { stateName: "Maharashtra", name: "Pune" } });
}

let n = 0;
export async function makeUser(role: Role, name = `${role} ${++n}`): Promise<SessionUser> {
  const u = await db.user.create({
    data: { name, email: `${name.replace(/\W+/g, ".").toLowerCase()}.${n}@test.local`, role, passwordHash: "x" },
  });
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export async function makeProduct(name: string, price: number | null = null) {
  return db.product.create({ data: { code: `T${++n}`, name, type: "SERVICE", price } });
}

export function leadData(assignedToId: string, over: Partial<LeadInput> = {}): LeadInput {
  return {
    schoolName: "Test Preschool",
    contactName: "Test Owner",
    mobile: "98765 43210",
    state: "Maharashtra",
    city: "Pune",
    source: "Google",
    assignedToId,
    nextFollowUpDate: addDays(todayIST(), 1),
    interests: [],
    ...over,
  };
}
