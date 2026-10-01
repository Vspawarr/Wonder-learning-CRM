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
export const INITIAL_PRODUCTS = [
  { code: "P01", name: "Curriculum License", category: "Curriculum" },
  { code: "P02", name: "Preschool Setup Package", category: "School Setup" },
  { code: "P03", name: "Teacher Training", category: "Teacher Training" },
  { code: "P04", name: "Parent Workshop", category: "Parent Engagement" },
  { code: "P05", name: "School Audit", category: "Assessment" },
  { code: "P06", name: "Marketing Campaign", category: "Marketing" },
  { code: "P07", name: "Branding Support", category: "Branding" },
] as const;

export const CLIENT_STATUS_LABEL = { ONBOARDING: "Onboarding", ACTIVE: "Active" } as const;

/** How a payment was received. */
export const PAYMENT_MODES = ["NEFT/RTGS", "UPI", "Cheque", "CDC (Current Dated Cheque)", "PDC (Post Dated Cheque)", "Cash", "Other"] as const;

/** Days after the invoice date when payment is due, unless changed on the invoice. */
export const DEFAULT_PAYMENT_DAYS = 45;

export const leadCode = (n: number) => `L-${n}`;
export const clientCode = (n: number) => `C-${n}`;
export const oppCode = (n: number) => `O-${n}`;
