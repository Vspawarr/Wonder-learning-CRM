// Extra people at a school (Principal, Accounts…). One can be marked as the
// person who gets payment reminders and receipts.
import { z } from "zod";
import { db } from "@/lib/db";
import { CONTACT_ROLES } from "@/lib/constants";
import type { SessionUser } from "@/lib/permissions";
import { clientScope } from "./access";
import { NotFoundError } from "./errors";
import { MOBILE_RE, parse } from "./validation";

const contactInput = z
  .object({
    name: z.string().trim().min(1, "Enter the person's name.").max(120),
    role: z.enum(CONTACT_ROLES, { error: "Choose their role." }),
    mobile: z
      .string()
      .trim()
      .nullish()
      .transform((s) => s || null)
      .refine((s) => s === null || MOBILE_RE.test(s), "Enter a valid mobile number."),
    email: z
      .string()
      .trim()
      .nullish()
      .transform((s) => s || null)
      .refine((s) => s === null || z.email().safeParse(s).success, "Enter a valid email address."),
    forPayments: z.boolean().default(false),
  })
  .refine((c) => c.mobile || c.email, "Enter a mobile number or an email.");

async function assertClient(user: SessionUser, clientId: string) {
  if (!(await db.client.count({ where: { id: clientId, ...clientScope(user) } }))) throw new NotFoundError("Client");
}

export async function saveContact(user: SessionUser, clientId: string, id: string | null, raw: unknown) {
  const d = parse(contactInput, raw);
  await assertClient(user, clientId);
  await db.$transaction(async (tx) => {
    if (d.forPayments) await tx.clientContact.updateMany({ where: { clientId }, data: { forPayments: false } });
    if (id) {
      const n = await tx.clientContact.updateMany({ where: { id, clientId }, data: d });
      if (!n.count) throw new NotFoundError("Contact");
    } else await tx.clientContact.create({ data: { ...d, clientId } });
    await tx.activity.create({ data: { type: "SYSTEM", subject: `Contact ${id ? "updated" : "added"}: ${d.name} (${d.role})`, byId: user.id, clientId } });
  });
}

export async function deleteContact(user: SessionUser, id: string) {
  const c = await db.clientContact.findFirst({ where: { id, client: clientScope(user) } });
  if (!c) throw new NotFoundError("Contact");
  await db.clientContact.delete({ where: { id } });
}
