// Master lists from Wonder Learning's field specification (copied verbatim
// from the prototype). Stored as text in the database and validated against
// these lists, so editing a list here needs no migration.

export const SOURCES = [
  "Facebook",
  "Instagram",
  "Google",
  "WhatsApp",
  "Website",
  "Reference",
  "Existing School Reference",
  "Exhibition / Event",
  "Seminar / Workshop",
  "Teacher Training",
  "Sales Visit",
  "Telecalling",
  "Walk-in",
  "Email",
  "Other",
] as const;

/** Sources for which "Reference name" is shown and kept. */
export const REF_SOURCES: readonly string[] = ["Reference", "Existing School Reference"];

export const DESIGNATIONS = [
  "Owner",
  "Director",
  "Principal",
  "Trustee",
  "Administrator",
  "Coordinator",
  "Teacher",
  "Other",
] as const;

/** Suggestions only: "Current publication / curriculum" is free text. */
export const PUBLICATIONS = [
  "Self Developed",
  "Oxford",
  "Macmillan",
  "Navneet",
  "Target",
  "Ratna Sagar",
  "Cordova",
  "ELP",
  "EuroKids",
  "Kidzee",
  "Bachpan",
  "Other",
  "Not Using Any Publication",
  "Information Not Available",
] as const;

export const FOLLOWUP_TYPES = ["Call", "WhatsApp/Message", "Email", "School Visit", "Online Demo"] as const;

/** A person's own to-dos (not about a school). */
export const TODO_TYPES = ["Internal Meeting", "Document Preparation", "Report / Admin Work", "Training", "Reminder", "Other"] as const;

/** Everything a task can be: client follow-ups and own to-dos. */
export const TASK_TYPES = [...FOLLOWUP_TYPES, ...TODO_TYPES] as const;

export const COMPETITORS = [
  "EuroKids",
  "Kidzee",
  "Bachpan",
  "Hello Kids",
  "Little Millennium",
  "Other",
] as const;

/** Used for both lead disqualification and opportunity loss. */
export const LOST_REASONS = [
  "Price Issue",
  "Competitor",
  "No Budget",
  "Not Interested",
  "Postponed",
  "Other",
] as const;

// ── Workflow enums: display labels and rules ──

export const ROLE_LABEL = {
  DIRECTOR: "Director",
  ADMIN: "Admin",
  SALES_HEAD: "Sales Head",
  SALES_MANAGER: "Sales Manager",
  SALES_EXECUTIVE: "Sales Executive",
} as const;

export const LEAD_STATUS_LABEL = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  CONVERTED: "Converted",
  DISQUALIFIED: "Disqualified",
} as const;

/** Statuses a user may set by hand; the other two come from actions. */
export const MANUAL_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED"] as const;

/** Shown to users as "Category" (stored as temperature). */
export const TEMPERATURE_LABEL = { HOT: "Hot", WARM: "Warm", COLD: "Cold" } as const;

export const STAGES = [
  "INTERESTED",
  "DEMO_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  INTERESTED: "Interested",
  DEMO_SCHEDULED: "Demo Scheduled",
  PROPOSAL_SENT: "Proposal Sent",
  NEGOTIATION: "Negotiation",
  WON: "Won",
  LOST: "Lost",
};

/** Probability (%) auto-set on every stage change. */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  INTERESTED: 20,
  DEMO_SCHEDULED: 35,
  PROPOSAL_SENT: 55,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

export const STAGE_COLOR: Record<Stage, string> = {
  INTERESTED: "#2E9BDA",
  DEMO_SCHEDULED: "#8B5CC6",
  PROPOSAL_SENT: "#E8930C",
  NEGOTIATION: "#D9548A",
  WON: "#0E8F79",
  LOST: "#8B88A6",
};

export const CLOSED_STAGES: readonly Stage[] = ["WON", "LOST"];

/** Phase 1 product catalogue — names only; prices/GST are entered in-app. */
export const CLIENT_STATUS_LABEL = { ONBOARDING: "Onboarding", ACTIVE: "Active" } as const;

/** How a payment was received. */
export const PAYMENT_MODES = ["NEFT/RTGS", "UPI", "Cheque", "CDC (Current Dated Cheque)", "PDC (Post Dated Cheque)", "Cash", "Other"] as const;

/** Days after the invoice date when payment is due, unless changed on the invoice. */
/** Kinds of papers kept on a client (Settings → Features → Client documents). */
export const DOCUMENT_CATEGORIES = ["Agreement / MOU", "GST certificate", "PAN card", "Cheque copy", "School registration", "Other"] as const;
export const POD_CATEGORY = "Proof of delivery";

/** People at a school besides the main contact. */
export const CONTACT_ROLES = ["Owner", "Director", "Principal", "Coordinator", "Accounts", "Teacher", "Other"] as const;

/** Payment modes that are cheques (tracked In hand → Deposited → Cleared when cheque tracking is on). */
export const CHEQUE_MODES: readonly string[] = ["Cheque", "CDC (Current Dated Cheque)", "PDC (Post Dated Cheque)"];

export const PAYMENT_STATUS_LABEL = {
  RECEIVED: "Received",
  IN_HAND: "Cheque in hand",
  DEPOSITED: "Cheque deposited",
  CLEARED: "Cheque cleared",
  BOUNCED: "Cheque bounced",
} as const;

export const DEFAULT_PAYMENT_DAYS = 45;

export const leadCode = (n: number) => `L-${n}`;
export const clientCode = (n: number) => `C-${n}`;
export const oppCode = (n: number) => `O-${n}`;
