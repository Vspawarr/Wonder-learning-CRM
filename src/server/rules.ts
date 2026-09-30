// Pure workflow rules (no database), unit-tested directly.
import type { ActivityType } from "@/generated/prisma/enums";
import { CLOSED_STAGES, STAGE_LABEL, STAGE_PROBABILITY, type Stage } from "@/lib/constants";
import { DomainError } from "./errors";

export const ACTIVE_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED"] as const;
export const isActiveLead = (status: string) => (ACTIVE_LEAD_STATUSES as readonly string[]).includes(status);

export type StagePlan = {
  probability: number;
  closes: boolean;
  /** Title for an automatic follow-up task, if the move creates one. */
  autoTask: string | null;
};

export function planStageMove(from: Stage, to: Stage, school: string): StagePlan {
  if (from === to) throw new DomainError(`Already in ${STAGE_LABEL[to]}.`);
  if (CLOSED_STAGES.includes(from))
    throw new DomainError("Closed deals cannot be moved. Create a new opportunity instead.");
  const autoTask =
    to === "PROPOSAL_SENT" || to === "NEGOTIATION" ? `Follow up after ${STAGE_LABEL[to].toLowerCase()}: ${school}` : null;
  return { probability: STAGE_PROBABILITY[to], closes: CLOSED_STAGES.includes(to), autoTask };
}

/** Which interaction type completing a task of this type represents. */
export function activityTypeForTask(type: string): ActivityType {
  switch (type) {
    case "Call":
    case "Proposal Follow-up":
      return "PHONE";
    case "WhatsApp":
      return "WHATSAPP";
    case "Email":
      return "EMAIL";
    case "Meeting":
    case "Demo":
      return "MEETING";
    case "School Visit":
      return "SITE_VISIT";
    default:
      return "NOTE";
  }
}

/** Which task type a follow-up from a logged interaction should get. */
export function taskTypeForActivity(type: ActivityType): string {
  switch (type) {
    case "WHATSAPP":
      return "WhatsApp";
    case "EMAIL":
      return "Email";
    case "MEETING":
      return "Meeting";
    case "SITE_VISIT":
      return "School Visit";
    default:
      return "Call";
  }
}
