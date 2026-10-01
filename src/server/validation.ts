import { z } from "zod";
import {
  COMPETITORS,
  DESIGNATIONS,
  FOLLOWUP_TYPES,
  LOST_REASONS,
  MANUAL_LEAD_STATUSES,
  SOURCES,
  STAGES,
} from "@/lib/constants";
import { isDateStr } from "@/lib/dates";
import { DomainError } from "./errors";

/** Trimmed text; empty becomes null. */
const optText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => s || null);
const reqText = (label: string, max = 200) => z.string({ error: `${label} is required.` }).trim().min(1, `${label} is required.`).max(max);
const optOneOf = <T extends readonly [string, ...string[]]>(list: T, label: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((s) => s || null)
    .refine((s) => s === null || (list as readonly string[]).includes(s), `Choose a valid ${label}.`);
const oneOf = <T extends readonly [string, ...string[]]>(list: T, label: string) =>
  z.string({ error: `${label} is required.` }).refine((s) => (list as readonly string[]).includes(s), `Choose a valid ${label}.`);
const reqDate = (label: string) => z.string({ error: `${label} is required.` }).refine(isDateStr, `${label} is required.`);
const optDate = z
  .string()
  .nullish()
  .transform((s) => s || null)
  .refine((s) => s === null || isDateStr(s), "Enter a valid date.");
const optInt = (label: string, min: number) =>
  z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => (v === "" || v == null ? null : Number(v)))
    .refine((n) => n === null || (Number.isInteger(n) && n >= min), `${label} must be a whole number of at least ${min}.`);

export const MOBILE_RE = /^[0-9 +\-]{10,15}$/;

const leadDetails = {
  schoolName: reqText("School name"),
  contactName: reqText("Owner / contact person"),
  designation: optOneOf(DESIGNATIONS, "designation"),
  mobile: z.string({ error: "Mobile number is required." }).trim().regex(MOBILE_RE, "Enter a valid mobile number."),
  email: z
    .string()
    .trim()
    .nullish()
    .transform((s) => s || null)
    .refine((s) => s === null || z.email().safeParse(s).success, "Enter a valid email address."),
  state: reqText("State", 100), // checked against Settings → Locations in the service
  city: reqText("City", 100),
  area: optText(200),
  address: optText(),
  currentCurriculum: optText(200),
  studentStrength: optInt("Student strength", 0),
  branches: optInt("Number of branches", 1),
  source: oneOf(SOURCES, "lead source"),
  referenceName: optText(200),
  interests: z.array(z.string()).max(50).default([]),
  remarks: optText(),
  /** The opportunity's category; only used (and required) when the lead is saved as Qualified. */
  temperature: z.enum(["HOT", "WARM", "COLD"]).nullish(),
  assignedToId: z.string({ error: "Assigned to is required." }).min(1, "Assigned to is required."),
  nextFollowUpDate: reqDate("Next follow-up date"),
  followUpType: optOneOf(FOLLOWUP_TYPES, "follow-up type"),
  followUpRemark: optText(),
};

export const leadInput = z
  .object({ ...leadDetails, status: z.enum(MANUAL_LEAD_STATUSES).default("NEW") })
  .refine((d) => d.status !== "QUALIFIED" || !!d.temperature, {
    message: "A Qualified lead becomes an opportunity: choose its category (Hot, Warm or Cold).",
    path: ["temperature"],
  });

export const convertInput = z.object({
  temperature: z.enum(["HOT", "WARM", "COLD"], { error: "Choose the category: Hot, Warm or Cold." }),
});
export type LeadInput = z.input<typeof leadInput>;

export const disqualifyInput = z.object({ reason: oneOf(LOST_REASONS, "reason"), remarks: optText() });

export const activityInput = z
  .object({
    leadId: z.string().nullish(),
    opportunityId: z.string().nullish(),
    clientId: z.string().nullish(),
    type: z.enum(["PHONE", "WHATSAPP", "EMAIL", "MEETING", "SITE_VISIT", "NOTE"]),
    subject: optText(200),
    summary: reqText("What was discussed", 4000),
    nextAction: optText(300),
    followUpDate: optDate,
  })
  .refine((a) => [a.leadId, a.opportunityId, a.clientId].filter(Boolean).length === 1, "Choose a lead, opportunity or client.");

export const oppUpdateInput = z.object({
  /** Left out = keep the saved category. */
  temperature: z.enum(["HOT", "WARM", "COLD"]).optional(),
  expectedValue: z
    .union([z.number(), z.string()])
    .nullish()
    // Left out = keep the saved value; blank = clear it.
    .transform((v) => (v === undefined ? undefined : v === "" || v === null ? null : Number(String(v).replace(/,/g, ""))))
    .refine((n) => n == null || (Number.isFinite(n) && n >= 0 && n < 1e12), "Enter a valid expected value."),
  expectedCloseDate: optDate,
  competitor: optOneOf(COMPETITORS, "competitor"),
  decisionMaker: optText(200),
  nextAction: optText(300),
  nextActionDate: optDate,
  ownerId: z.string().min(1),
  /** Optional: the screen no longer edits items (products are priced on quotations). */
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.coerce.number().int().min(1).max(100000) }))
    .max(50)
    .optional(),
});

export const stageMoveInput = z
  .object({
    stage: z.enum(STAGES),
    lostReason: z.string().nullish(),
    lostRemarks: optText(),
    competitor: optOneOf(COMPETITORS, "competitor"),
  })
  .superRefine((m, ctx) => {
    if (m.stage !== "LOST") return;
    if (!m.lostReason || !(LOST_REASONS as readonly string[]).includes(m.lostReason))
      ctx.addIssue({ code: "custom", message: "A reason is required to mark a deal as lost." });
    if (!m.lostRemarks) ctx.addIssue({ code: "custom", message: "Remarks are required to mark a deal as lost." });
  });

export const TASK_TYPES = [...FOLLOWUP_TYPES, "Other"] as const;

export const taskInput = z
  .object({
    title: reqText("Task", 300),
    type: oneOf(TASK_TYPES, "type"),
    dueDate: reqDate("Due date"),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
    assigneeId: z.string().min(1, "Assign the task to someone."),
    remark: optText(),
    leadId: z.string().nullish(),
    opportunityId: z.string().nullish(),
    clientId: z.string().nullish(),
  })
  .refine((t) => [t.leadId, t.opportunityId, t.clientId].filter(Boolean).length <= 1, "Link the task to only one record.");

export const completeTaskInput = z.object({ outcome: optText(4000), nextDate: optDate });

export const userInput = z.object({
  name: reqText("Name", 120),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  mobile: z
    .string()
    .trim()
    .nullish()
    .transform((s) => s || null)
    .refine((s) => s === null || MOBILE_RE.test(s), "Enter a valid mobile number."),
  role: z.enum(["DIRECTOR", "ADMIN", "SALES_HEAD", "SALES_MANAGER", "SALES_EXECUTIVE"]),
  active: z.boolean().default(true),
  password: z
    .string()
    .nullish()
    .transform((s) => s || null)
    .refine((s) => s === null || s.length >= 8, "Password must be at least 8 characters."),
});

const optMoney = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((v) => (v === "" || v == null ? null : Number(v)))
  .refine((n) => n === null || (Number.isFinite(n) && n >= 0), "Enter a valid amount.");

export const productInput = z.object({
  name: reqText("Name", 200),
  category: optText(100),
  price: optMoney,
  gstRate: optMoney.refine((n) => n === null || n <= 100, "GST must be a percentage."),
  active: z.boolean().default(true),
});

export const cityInput = z.object({ stateName: reqText("State", 100), name: reqText("City", 100) });
export const stateInput = z.object({ name: reqText("State", 100) });

/** Parse or throw a DomainError carrying the first message. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new DomainError(r.error.issues[0]?.message ?? "Invalid input.");
  return r.data;
}
