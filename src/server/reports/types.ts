// A printable report: one or more tables, rendered to Excel or PDF by render.ts.
export type Cell = string | number | null;

export type ReportColumn = {
  key: string;
  header: string;
  /** Relative width (PDF) / characters (Excel). */
  width?: number;
  /** "money" right-aligns and formats as ₹; "number" right-aligns. */
  kind?: "text" | "money" | "number";
};

export type ReportSection = {
  heading?: string;
  columns: ReportColumn[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  empty?: string;
};

export type Report = {
  /** Used for the file name too. */
  title: string;
  /** Filters / period line under the title. */
  subtitle?: string;
  sections: ReportSection[];
  landscape?: boolean;
};
