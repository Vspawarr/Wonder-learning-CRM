// The Excel lead template's columns, shared by the template builder and the
// upload parser. Every allowed-values list comes from src/lib/constants.ts or
// from Settings → Locations / active users at the moment of use — nothing is
// copied here, so the form, the template and the upload can't drift apart.
import {
  DESIGNATIONS,
  FOLLOWUP_TYPES,
  LEAD_STATUS_LABEL,
  MANUAL_LEAD_STATUSES,
  SOURCES,
  TEMPERATURE_LABEL,
} from "@/lib/constants";

/** Lists that change with the database rather than with the code. */
export type LiveLists = { states: string[]; cities: Record<string, string[]>; assignees: string[] };

export type ListKey = "designation" | "state" | "city" | "source" | "status" | "category" | "assignee" | "followUpType";

/** Display values allowed for each dropdown column. */
export function allowedValues(live: LiveLists): Record<Exclude<ListKey, "city">, readonly string[]> {
  return {
    designation: DESIGNATIONS,
    state: live.states,
    source: SOURCES,
    status: MANUAL_LEAD_STATUSES.map((s) => LEAD_STATUS_LABEL[s]),
    category: Object.values(TEMPERATURE_LABEL),
    assignee: live.assignees,
    followUpType: FOLLOWUP_TYPES,
  };
}

/** Label shown in the sheet → value stored on the lead. */
export const STATUS_BY_LABEL = Object.fromEntries(MANUAL_LEAD_STATUSES.map((s) => [LEAD_STATUS_LABEL[s], s])) as Record<
  string,
  (typeof MANUAL_LEAD_STATUSES)[number]
>;
export const CATEGORY_BY_LABEL = Object.fromEntries(Object.entries(TEMPERATURE_LABEL).map(([k, v]) => [v, k])) as Record<
  string,
  keyof typeof TEMPERATURE_LABEL
>;

export type ColumnKey =
  | "schoolName"
  | "contactName"
  | "designation"
  | "mobile"
  | "email"
  | "state"
  | "city"
  | "area"
  | "address"
  | "currentCurriculum"
  | "studentStrength"
  | "branches"
  | "source"
  | "referenceName"
  | "status"
  | "category"
  | "assignedTo"
  | "nextFollowUpDate"
  | "followUpType"
  | "followUpRemark";

export type Column = {
  key: ColumnKey;
  /** Exact header text; required columns end in "*". The upload checks this row exactly. */
  header: string;
  required: boolean;
  width: number;
  list?: ListKey;
  kind?: "text" | "int" | "date";
  min?: number;
  note?: string;
};

// Same fields, order and required flags as the New Lead form.
export const COLUMNS: Column[] = [
  { key: "schoolName", header: "School Name*", required: true, width: 30 },
  { key: "contactName", header: "Owner/Contact Person Name*", required: true, width: 26 },
  { key: "designation", header: "Designation", required: false, width: 16, list: "designation" },
  { key: "mobile", header: "Mobile Number*", required: true, width: 16, note: "10–15 digits; spaces, + and - allowed" },
  { key: "email", header: "Email ID", required: false, width: 26 },
  { key: "state", header: "State*", required: true, width: 18, list: "state" },
  { key: "city", header: "City*", required: true, width: 18, list: "city", note: "Choose the State first" },
  { key: "area", header: "Area/Location", required: false, width: 18 },
  { key: "address", header: "Address", required: false, width: 30 },
  { key: "currentCurriculum", header: "Current Publication/Curriculum", required: false, width: 26 },
  { key: "studentStrength", header: "Current Student Strength", required: false, width: 14, kind: "int", min: 0 },
  { key: "branches", header: "Number of Branches", required: false, width: 12, kind: "int", min: 1 },
  { key: "source", header: "Lead Source*", required: true, width: 22, list: "source" },
  { key: "referenceName", header: "Reference Name", required: false, width: 20, note: "Only kept for Reference / Existing School Reference" },
  { key: "status", header: "Lead Status", required: false, width: 13, list: "status", note: "Blank = New. Qualified creates an opportunity" },
  { key: "category", header: "Category", required: false, width: 11, list: "category", note: "Blank = Warm" },
  { key: "assignedTo", header: "Assigned To*", required: true, width: 20, list: "assignee" },
  { key: "nextFollowUpDate", header: "Next Follow-up Date*", required: true, width: 14, kind: "date", note: "DD/MM/YYYY" },
  { key: "followUpType", header: "Follow-up Type", required: false, width: 18, list: "followUpType" },
  { key: "followUpRemark", header: "Follow-up Remark", required: false, width: 30 },
];

export const HEADERS = COLUMNS.map((c) => c.header);
export const DATA_SHEET = "Leads";
export const MAX_ROWS = 1000;
/** School name used on the template's example row; the upload skips (and reports) it. */
export const EXAMPLE_SCHOOL = "EXAMPLE SCHOOL – delete this row";
