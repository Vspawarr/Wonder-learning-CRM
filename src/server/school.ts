// A school's details (name, contact, mobile, address…) live on its lead and, once it moves on, are copied to
// its opportunity and client. Correcting them in any one place updates all of them (R35), so a typing mistake
// never survives in another screen. Sent quotations keep what was sent; drafts follow the correction.
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/permissions";
import { leadScope, oppScope } from "./access";
import { NotFoundError } from "./errors";
import { assertLocation } from "./locations";
import { parse, schoolInput, type SchoolDetails } from "./validation";

type Tx = Prisma.TransactionClient;

export const SCHOOL_FIELD_LABEL: Record<keyof SchoolDetails, string> = {
  schoolName: "school name",
  contactName: "contact person",
  designation: "designation",
  mobile: "mobile",
  email: "email",
  state: "state",
  city: "city",
  area: "area",
  address: "address",
  currentCurriculum: "curriculum",
  studentStrength: "student strength",
  branches: "branches",
};

/** Just the school fields of a bigger form (e.g. the lead form). */
export const pick = (d: SchoolDetails): SchoolDetails => ({
  schoolName: d.schoolName,
  contactName: d.contactName,
  designation: d.designation,
  mobile: d.mobile,
  email: d.email,
  state: d.state,
  city: d.city,
  area: d.area,
  address: d.address,
  currentCurriculum: d.currentCurriculum,
  studentStrength: d.studentStrength,
  branches: d.branches,
});

/** The lead, opportunities and client that describe the same school as this record. */
async function chainOf(tx: Tx, ref: { leadId?: string | null; opportunityId?: string | null; clientId?: string | null }) {
  let leadId = ref.leadId ?? null;
  let clientId = ref.clientId ?? null;
  if (ref.opportunityId) {
    const o = await tx.opportunity.findUnique({ where: { id: ref.opportunityId }, select: { leadId: true, renewalOfId: true, client: { select: { id: true } } } });
    leadId ??= o?.leadId ?? null;
    clientId ??= o?.client?.id ?? o?.renewalOfId ?? null;
  }
  if (clientId && !leadId) {
    const c = await tx.client.findUnique({ where: { id: clientId }, select: { opportunity: { select: { leadId: true } } } });
    leadId = c?.opportunity.leadId ?? null;
  }
  if (leadId && !clientId) {
    const c = await tx.client.findFirst({ where: { opportunity: { leadId } }, select: { id: true } });
    clientId = c?.id ?? null;
  }
  const opps = await tx.opportunity.findMany({
    where: { OR: [...(leadId ? [{ leadId }] : []), ...(clientId ? [{ renewalOfId: clientId }, { client: { id: clientId } }] : []), ...(ref.opportunityId ? [{ id: ref.opportunityId }] : [])] },
    select: { id: true },
  });
  return { leadId, clientId, oppIds: opps.map((o) => o.id) };
}

/** Writes the details to every record of the school; returns the names of the fields that changed. */
export async function syncSchool(tx: Tx, ref: { leadId?: string | null; opportunityId?: string | null; clientId?: string | null }, d: SchoolDetails) {
  const { leadId, clientId, oppIds } = await chainOf(tx, ref);
  const before = leadId
    ? await tx.lead.findUnique({ where: { id: leadId } })
    : clientId
      ? await tx.client.findUnique({ where: { id: clientId } })
      : null;
  if (leadId) await tx.lead.update({ where: { id: leadId }, data: d });
  if (clientId) await tx.client.update({ where: { id: clientId }, data: d });
  if (oppIds.length) await tx.opportunity.updateMany({ where: { id: { in: oppIds } }, data: { schoolName: d.schoolName } });
  // Draft quotations show the corrected name and address; sent ones stay as the school received them.
  const quoteWhere = [...(leadId ? [{ leadId }] : []), ...(oppIds.length ? [{ opportunityId: { in: oppIds } }] : []), ...(clientId ? [{ clientId }] : [])];
  if (quoteWhere.length) await tx.quotation.updateMany({ where: { status: "DRAFT", OR: quoteWhere }, data: { schoolName: d.schoolName, address: d.address } });
  const changed = before
    ? (Object.keys(SCHOOL_FIELD_LABEL) as (keyof SchoolDetails)[]).filter((k) => (before as Record<string, unknown>)[k] !== d[k]).map((k) => SCHOOL_FIELD_LABEL[k])
    : [];
  return { leadId, clientId, oppIds, changed };
}

/**
 * Correct a school's details from a lead (any status, also converted or disqualified) or an opportunity.
 * Clients use Edit details (updateClient), which syncs the same way.
 */
export async function editSchool(user: SessionUser, ref: { leadId: string } | { opportunityId: string }, raw: unknown) {
  const d = parse(schoolInput, raw);
  return db.$transaction(async (tx) => {
    const current =
      "leadId" in ref
        ? await tx.lead.findFirst({ where: { id: ref.leadId, ...leadScope(user) }, select: { state: true, city: true } })
        : await tx.opportunity
            .findFirst({ where: { id: ref.opportunityId, ...oppScope(user) }, select: { lead: { select: { state: true, city: true } }, renewalOf: { select: { state: true, city: true } } } })
            .then((o) => (o ? (o.lead ?? o.renewalOf ?? { state: "", city: "" }) : null));
    if (!current) throw new NotFoundError("leadId" in ref ? "Lead" : "Opportunity");
    await assertLocation(tx, d.state, d.city, current);
    const r = await syncSchool(tx, ref, d);
    if (r.changed.length)
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          subject: `School details corrected: ${r.changed.join(", ")}`,
          byId: user.id,
          leadId: r.leadId,
          opportunityId: r.oppIds[0] ?? null,
          clientId: r.clientId,
        },
      });
    return r.changed;
  });
}

