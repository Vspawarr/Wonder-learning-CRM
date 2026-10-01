// Academic-year renewals: each client that ordered this year gets a renewal
// opportunity for the next academic year (June to May), worth last year's order.
import { db } from "@/lib/db";
import { addDays, todayIST, toDbDate, type DateStr } from "@/lib/dates";
import { seesAllSales, type SessionUser } from "@/lib/permissions";
import { clientScope } from "./access";
import { DomainError } from "./errors";
import { getFeatures } from "./features";
import { totals } from "./finance/money";

/** The academic year whose season we sell for now: the one starting next June ("2027-28"). */
export function nextAcademicYear(today: DateStr = todayIST()) {
  const [y, m] = today.split("-").map(Number);
  const start = m < 6 ? y : y + 1;
  return {
    label: `${start}-${String(start + 1).slice(2)}`,
    startsOn: `${start}-06-01` as DateStr,
  };
}

/** Clients with orders who don't yet have a renewal for the coming academic year. */
export async function renewalCandidates(user: SessionUser, onlyClientId?: string) {
  const ay = nextAcademicYear();
  const clients = await db.client.findMany({
    where: {
      ...clientScope(user),
      ...(onlyClientId ? { id: onlyClientId } : {}),
      salesOrders: { some: { status: { not: "CANCELLED" } } },
      renewals: { none: { academicYear: ay.label } },
    },
    include: {
      salesOrders: {
        where: { status: { not: "CANCELLED" } },
        include: { items: true },
        orderBy: { date: "desc" },
      },
    },
  });
  const yearAgo = toDbDate(addDays(todayIST(), -365));
  return {
    ay,
    clients: clients.map((c) => {
      // Last year's business: orders in the past 12 months (or the latest order).
      const recent = c.salesOrders.filter((o) => o.date >= yearAgo);
      const basis = recent.length ? recent : c.salesOrders.slice(0, 1);
      const value = basis.reduce(
        (t, o) =>
          t +
          totals(
            o.items.map((i) => ({
              qty: i.qty,
              price: Number(i.price),
              gstRate: Number(i.gstRate),
            })),
          ).total,
        0,
      );
      return { id: c.id, schoolName: c.schoolName, ownerId: c.ownerId, value };
    }),
  };
}

/** Creates renewal opportunities (all candidates the user can see, or one client). */
export async function createRenewals(user: SessionUser, clientId?: string) {
  if (!(await getFeatures()).renewals) throw new DomainError("Renewals are switched off in Settings → Features.");
  if (!clientId && !seesAllSales(user.role)) throw new DomainError("Only an Admin or the Sales Head can create renewals for everyone.");
  const { ay, clients } = await renewalCandidates(user, clientId);
  if (!clients.length)
    throw new DomainError(
      clientId ? `This client already has a renewal for AY ${ay.label}, or no orders yet.` : `Every client already has a renewal for AY ${ay.label}.`,
    );
  const today = todayIST();
  const closeBy = `${ay.startsOn.slice(0, 4)}-03-31`;
  await db.$transaction(async (tx) => {
    for (const c of clients) {
      const opp = await tx.opportunity.create({
        data: {
          schoolName: c.schoolName,
          stage: "INTERESTED",
          probability: 20,
          temperature: "WARM",
          expectedValue: c.value || null,
          expectedCloseDate: toDbDate(closeBy > today ? closeBy : addDays(today, 30)),
          nextAction: `Renewal for AY ${ay.label}`,
          nextActionDate: toDbDate(addDays(today, 7)),
          ownerId: c.ownerId,
          createdById: user.id,
          renewalOfId: c.id,
          academicYear: ay.label,
          stageChanges: {
            create: {
              fromStage: null,
              toStage: "INTERESTED",
              changedById: user.id,
            },
          },
        },
      });
      await tx.task.create({
        data: {
          type: "Call",
          title: `Renewal AY ${ay.label}: ${c.schoolName}`,
          remark: "Confirm next year's kits and student numbers.",
          dueDate: toDbDate(addDays(today, 7)),
          priority: "HIGH",
          isAuto: true,
          assigneeId: c.ownerId,
          createdById: user.id,
          opportunityId: opp.id,
        },
      });
      await tx.activity.create({
        data: {
          type: "SYSTEM",
          subject: `Renewal opportunity for AY ${ay.label} created`,
          byId: user.id,
          clientId: c.id,
          opportunityId: opp.id,
        },
      });
    }
  });
  return { count: clients.length, ay: ay.label };
}
