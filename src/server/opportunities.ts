import { db, type Tx } from "@/lib/db";
import { CLOSED_STAGES, STAGE_LABEL, type Stage } from "@/lib/constants";
import { addDays, todayIST, toDbDate } from "@/lib/dates";
import type { SessionUser } from "@/lib/permissions";
import { assertAssignable, oppScope } from "./access";
import { DomainError, NotFoundError } from "./errors";
import { planStageMove } from "./rules";
import { oppUpdateInput, parse, stageMoveInput } from "./validation";

async function loadOpp(tx: Tx, user: SessionUser, id: string) {
  const opp = await tx.opportunity.findFirst({ where: { id, ...oppScope(user) } });
  if (!opp) throw new NotFoundError("Opportunity");
  return opp;
}

export async function updateOpportunity(user: SessionUser, id: string, raw: unknown) {
  const d = parse(oppUpdateInput, raw);
  return db.$transaction(async (tx) => {
    const opp = await loadOpp(tx, user, id);
    if (CLOSED_STAGES.includes(opp.stage)) throw new DomainError("Closed deals can't be edited.");
    if (d.ownerId !== opp.ownerId) await assertAssignable(tx, user, d.ownerId);

    if (d.items) {
      const items = d.items;
      const productIds = [...new Set(items.map((i) => i.productId))];
      if (productIds.length !== items.length) throw new DomainError("Each product can appear only once.");
      const [products, current] = await Promise.all([
        tx.product.findMany({ where: { id: { in: productIds } } }),
        tx.opportunityItem.findMany({ where: { opportunityId: id } }),
      ]);
      if (products.length !== productIds.length) throw new DomainError("One of the chosen products doesn't exist.");
      const kept = new Map(current.map((i) => [i.productId, i]));
      for (const p of products)
        if (!p.active && !kept.has(p.id)) throw new DomainError(`${p.name} is no longer offered.`);

      await tx.opportunityItem.deleteMany({ where: { opportunityId: id, productId: { notIn: productIds } } });
      for (const item of items) {
        const prev = kept.get(item.productId);
        if (prev) await tx.opportunityItem.update({ where: { id: prev.id }, data: { qty: item.qty } });
        else
          await tx.opportunityItem.create({
            data: {
              opportunityId: id,
              productId: item.productId,
              qty: item.qty,
              unitPrice: products.find((p) => p.id === item.productId)!.price,
            },
          });
      }
    }

    await tx.opportunity.update({
      where: { id },
      data: {
        ...(d.expectedValue !== undefined ? { expectedValue: d.expectedValue } : {}),
        expectedCloseDate: d.expectedCloseDate ? toDbDate(d.expectedCloseDate) : null,
        competitor: d.competitor,
        decisionMaker: d.decisionMaker,
        nextAction: d.nextAction,
        nextActionDate: d.nextActionDate ? toDbDate(d.nextActionDate) : null,
        ownerId: d.ownerId,
      },
    });
    if (d.ownerId !== opp.ownerId) {
      const to = await tx.user.findUniqueOrThrow({ where: { id: d.ownerId }, select: { name: true } });
      await tx.task.updateMany({ where: { opportunityId: id, status: "OPEN" }, data: { assigneeId: d.ownerId } });
      await tx.activity.create({
        data: { type: "SYSTEM", subject: `Reassigned to ${to.name}`, byId: user.id, opportunityId: id, leadId: opp.leadId },
      });
    }
  });
}

export async function moveOpportunity(user: SessionUser, id: string, raw: unknown) {
  const m = parse(stageMoveInput, raw);
  return db.$transaction(async (tx) => {
    const opp = await loadOpp(tx, user, id);
    const to = m.stage as Stage;
    const plan = planStageMove(opp.stage, to, opp.schoolName);
    const now = new Date();

    await tx.opportunity.update({
      where: { id },
      data: {
        stage: to,
        probability: plan.probability,
        closedAt: plan.closes ? now : null,
        ...(to === "LOST"
          ? { lostReason: m.lostReason, lostRemarks: m.lostRemarks, competitor: m.competitor ?? opp.competitor }
          : {}),
        // Phase 2: WON will create the School and Sales Order here.
      },
    });
    await tx.opportunityStageChange.create({
      data: { opportunityId: id, fromStage: opp.stage, toStage: to, changedById: user.id },
    });
    if (plan.closes)
      await tx.task.updateMany({
        where: { opportunityId: id, status: "OPEN" },
        data: { status: "CANCELLED", outcome: `Deal ${STAGE_LABEL[to].toLowerCase()}`, completedAt: now },
      });
    if (plan.autoTask)
      await tx.task.create({
        data: {
          type: "Call",
          title: plan.autoTask,
          dueDate: toDbDate(addDays(todayIST(), 2)),
          priority: "MEDIUM",
          isAuto: true,
          assigneeId: opp.ownerId,
          createdById: user.id,
          opportunityId: id,
        },
      });
    await tx.activity.create({
      data: {
        type: "SYSTEM",
        subject:
          to === "LOST"
            ? `Marked lost: ${m.lostReason}`
            : `Stage: ${STAGE_LABEL[opp.stage]} → ${STAGE_LABEL[to]} (${plan.probability}%)`,
        summary: to === "LOST" ? m.lostRemarks : null,
        byId: user.id,
        opportunityId: id,
        leadId: opp.leadId,
      },
    });
  });
}
