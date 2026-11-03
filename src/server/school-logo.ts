// R51: the school's own logo, printed on its PO template. Stored once per school: on the lead and, when
// the school is (or becomes) a client, on the client too, so every later PO template for the school has it.
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { DomainError } from "./errors";
import { loadQuotation } from "./quotation/service";

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
/** The PDF library prints PNG and JPG only. */
export const LOGO_TYPES: Record<string, "png" | "jpg"> = { "image/png": "png", "image/jpeg": "jpg" };

/** The school behind a quotation: its client (deal won, client quote or renewal) and its lead. */
async function schoolOf(q: { leadId: string | null; clientId: string | null; opportunityId: string | null }) {
  const opp = q.opportunityId
    ? await db.opportunity.findUnique({ where: { id: q.opportunityId }, select: { leadId: true, renewalOfId: true, client: { select: { id: true } } } })
    : null;
  const clientId = q.clientId ?? opp?.client?.id ?? opp?.renewalOfId ?? null;
  const leadId =
    q.leadId ??
    opp?.leadId ??
    (clientId ? (await db.client.findUnique({ where: { id: clientId }, select: { opportunity: { select: { leadId: true } } } }))?.opportunity.leadId : null) ??
    null;
  return { clientId, leadId };
}

async function findLogo(school: { clientId: string | null; leadId: string | null }) {
  const or = [...(school.clientId ? [{ clientId: school.clientId }] : []), ...(school.leadId ? [{ leadId: school.leadId }] : [])];
  if (!or.length) return null;
  const rows = await db.schoolLogo.findMany({ where: { OR: or } });
  return rows.find((r) => school.clientId && r.clientId === school.clientId) ?? rows[0] ?? null;
}

/** The logo for a quotation's school, for the PO template (no access check: callers have already loaded the quotation). */
export async function logoForQuotation(q: { leadId: string | null; clientId: string | null; opportunityId: string | null }) {
  const l = await findLogo(await schoolOf(q));
  return l ? { data: Buffer.from(l.data), format: LOGO_TYPES[l.contentType] ?? "png" } : null;
}

export async function schoolLogo(user: SessionUser, quotationId: string) {
  const l = await findLogo(await schoolOf(await loadQuotation(user, quotationId)));
  if (!l) throw new DomainError("No logo has been uploaded for this school.");
  return l;
}

export async function saveSchoolLogo(user: SessionUser, quotationId: string, file: { name: string; type: string; bytes: Uint8Array }) {
  const school = await schoolOf(await loadQuotation(user, quotationId));
  if (!school.clientId && !school.leadId) throw new DomainError("This quotation isn't linked to a school.");
  if (!LOGO_TYPES[file.type]) throw new DomainError("Upload the logo as a PNG or JPG picture.");
  if (!file.bytes.length) throw new DomainError("The file is empty.");
  if (file.bytes.length > LOGO_MAX_BYTES) throw new DomainError("The logo is larger than 2 MB. Please upload a smaller picture.");
  const data = {
    fileName: file.name.slice(0, 200) || "logo",
    contentType: file.type,
    size: file.bytes.length,
    data: Buffer.from(file.bytes),
    uploadedById: user.id,
    uploadedAt: new Date(),
  };
  // One logo per school: replace what the client or the lead already has.
  await db.$transaction(async (tx) => {
    const or = [...(school.clientId ? [{ clientId: school.clientId }] : []), ...(school.leadId ? [{ leadId: school.leadId }] : [])];
    await tx.schoolLogo.deleteMany({ where: { OR: or } });
    await tx.schoolLogo.create({ data: { ...data, clientId: school.clientId, leadId: school.leadId } });
  });
}

export async function removeSchoolLogo(user: SessionUser, quotationId: string) {
  const school = await schoolOf(await loadQuotation(user, quotationId));
  const or = [...(school.clientId ? [{ clientId: school.clientId }] : []), ...(school.leadId ? [{ leadId: school.leadId }] : [])];
  if (or.length) await db.schoolLogo.deleteMany({ where: { OR: or } });
}
