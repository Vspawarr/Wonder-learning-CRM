// Dashboard areas a user can show or hide (one or several at a time).
export const DASH_SECTIONS = [
  ["sales", "Sales", "#1C86C4"],
  ["finance", "Finance", "#0E8F79"],
  ["team", "Team & management", "#7A48B8"],
  ["service", "Service & delivery", "#C77A00"],
] as const;

export type DashSection = (typeof DASH_SECTIONS)[number][0];

/** From ?show=sales,finance (or the remembered cookie); empty, "all" or unknown means everything. */
export function parseSections(raw: string | undefined): DashSection[] {
  const keys = DASH_SECTIONS.map(([k]) => k) as DashSection[];
  const picked = (raw ?? "").split(",").filter((s): s is DashSection => (keys as string[]).includes(s));
  return picked.length ? picked : keys;
}
