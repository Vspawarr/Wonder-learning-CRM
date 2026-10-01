// Optional features an Admin can switch on or off in Settings → Features.
// Switching one off hides it everywhere; data already entered is kept.

export const FEATURES = {
  advance: { label: "Advance payments & proforma invoice", hint: "Take advance on a sales order before invoicing; print a proforma invoice." },
  cheques: { label: "Cheque / PDC tracking", hint: "Cheque number, bank and date; In hand → Deposited → Cleared / Bounced. Counts as received when cleared." },
  creditNotes: { label: "Credit notes", hint: "Reduce an invoice (returns, discount, write-off) with a numbered credit note." },
  dispatch: { label: "Dispatch & delivery challan", hint: "Send kits in one or more lots with transporter details, challan PDF and proof of delivery." },
  renewals: { label: "Academic-year renewals", hint: "Create next year's renewal opportunities from this year's orders." },
  ageing: { label: "Outstanding ageing & forecast", hint: "Overdue amounts by 0–30, 31–60, 61–90, 90+ days and expected collections." },
  targets: { label: "Sales & collection targets", hint: "Monthly targets per salesperson, shown against achievement on the dashboard." },
  contacts: { label: "Several contacts per school", hint: "Owner, Principal, Accounts… choose who gets each message." },
  documents: { label: "Client documents", hint: "Keep agreements, GST certificate and other papers on the client page." },
  quoteExpiry: { label: "Quotation validity", hint: "Mark quotations Expired after their validity and book a follow-up before they expire." },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type Features = Record<FeatureKey, boolean>;

/** New features start switched on. */
export const DEFAULT_FEATURES: Features = Object.fromEntries(Object.keys(FEATURES).map((k) => [k, true])) as Features;
