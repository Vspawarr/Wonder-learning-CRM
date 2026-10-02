# Business rules and decisions

How the CRM behaves and why. This is the reference for "what should happen when…". If a rule changes,
change it here in the same commit as the code. Requirement numbers (R…) point to `REQUIREMENTS.md`.

## People and roles

| Role | Sees | Can also |
|---|---|---|
| Director | Everyone's data | Users (incl. Directors), products, states/cities, quotation text, features, targets, money corrections |
| Admin (Gautami) | Everyone's data | Same as Director |
| Sales Head (Viren) | Everyone's data | Products & prices, targets, money corrections, assign work to anyone in sales |
| Sales Manager | **Only their own** leads, opportunities, clients, to-dos | Assign work only to themselves |
| Sales Executive | **Only their own** | Assign work only to themselves |

- Code: `src/lib/permissions.ts` (who may do what) and `src/server/access.ts` (what each person sees).
  These are the only places with these rules (R3, R4).
- **"Assigned to"** always means the salesperson responsible. **"Owner"** only means the school's owner (R20.2).
- Login: 5 wrong passwords lock the account for 15 minutes; "Forgot password" sends a one-hour reset link
  once email is set up (until then, an Admin resets it in Settings → Users). Deactivated users can't log in,
  but their records stay. **Hand over work** moves a leaving person's open items to someone else (R19 A4, A5).

## Lead → opportunity → client

1. **Lead** (school not yet a customer). Status: New → Contacted → Qualified, or Disqualified (reason from
   the Lost list). Saving a lead creates its first follow-up task. Logging an interaction moves New → Contacted.
2. **Convert to opportunity:** button on the lead, in the leads list, or tick it after logging an interaction.
   Saving a lead as **Qualified** converts it automatically. The person must choose the **Category
   (Hot / Warm / Cold)**, which belongs to the opportunity, not the lead (R16.1).
3. **Opportunity stages and probability:** Interested 20% → Demo Scheduled 35% → Proposal Sent 55% →
   Negotiation 75% → Won 100% / Lost 0%. Won and Lost are final. Lost needs a reason + remarks.
   Proposal Sent and Negotiation create a follow-up in 2 days. Sending a quotation moves the deal to
   Proposal Sent. Pipeline value = the typed **Expected deal value** (deals without one show "no value yet").
4. **Convert to client** on a Won deal → client in **Onboarding**, then **Active** when onboarding is marked complete.
5. **Renewals:** each academic year (June–May), clients who ordered get a "Renewal: AY …" opportunity valued
   at last year's orders (switchable feature).

Duplicates: a new lead with the same mobile, or the same school name in the same city, as an existing lead or
client shows a warning (the user may still save). The Excel upload skips same school name + mobile.

## Quotations, PO and orders

- Quotation from an opportunity or a client; products from the list; **MRP and Price typed by hand**,
  no discount column, GST % per line; validity days (default from Settings → Quotation). After the
  validity date it shows **Expired**, and a follow-up is booked the day before.
- Drafts can be edited; **sent quotations are locked**: use **Revise** to make a new version.
- **PO flow:** send the school a **PO template** made from the sent quotation → the school signs, seals and
  sends it back → **Upload signed PO** with its PO number → this creates the **sales order**. The PO number
  shows on the sales order, proforma and invoice. The sales order shows the quotation's creation time
  (date + H:M:S AM/PM) (R16.10, R17).
- **Dispatch** in one or more lots with transporter/docket, a challan PDF, and **Mark received** with proof.

## Money

- **Invoice** from a sales order. Due date = invoice date + 45 days by default (editable per invoice). States: Unpaid →
  Partially paid → Paid, or **Overdue** once past due. Cancelling an invoice is a finance-role action.
- **Payments** can be in any number of instalments. A **partial** payment asks for the **next promise date**,
  which becomes a collection follow-up in To-do (R16.3).
- **Counted as received** only when status is **Received** or **Cleared**. Cheques (Cheque, CDC, PDC) start
  **In hand** → **Deposited** → **Cleared** or **Bounced**; in hand/deposited cheques show as "pending";
  a bounced cheque makes the amount due again (urgent follow-up). A "Deposit cheque" reminder appears on
  the cheque date. If cheque tracking is switched off, cheques count immediately.
- **Advance** on a sales order (before invoicing) gets a receipt and comes off the invoice automatically
  when the order is invoiced. **Proforma invoice** can be printed from the sales order.
- **Credit note** reduces an invoice's balance (returns, discount, write-off).
- **Ledger:** invoices = debit, payments and credit notes = credit, by financial year (April–March) or
  custom dates, one client or all.
- **Ageing:** not yet due / 1–30 / 31–60 / 61–90 / over 90 days late. **Expected collections:** by promise
  date if given, else due date: late, this week, rest of month, later.
- **Money corrections** (cancel invoice, delete payment, credit notes, clear/bounce cheques) are only for
  Director, Admin and Sales Head (`canManageFinance`) (R19 A2).
- GST: education products are usually 0%; the rate is kept per line so other rates work.

## Numbering

Running numbers per calendar month, restarting at 001 each month:
QUO (quotation), SO (sales order), PI (proforma), INV (invoice), RCPT (receipt), CN (credit note),
DC (delivery challan), e.g. `INV/2026/10/001`. Leads L-1001…, opportunities O-2001…, clients C-101….
⏳ The client may give preferred formats ("ranges in sync", R16.8).

## Reminders and messages

- WhatsApp buttons open WhatsApp with a ready message and a private link to the PDF (`/q/`, `/i/`, `/r/`
  links work without logging in, but only with the secret token).
- Email buttons appear only when email (SMTP) is set up (`DEPLOY.md`). Replies go to the sender.
- With "several contacts" on, reminders and receipts go to the contact marked **payments contact** by default.

## To-do

Everyone has To-do: automatic school follow-ups plus their own items (Internal Meeting, Document
Preparation, Report / Admin Work, Training, Reminder, Other), with optional time and priority.
Actions: Done (with outcome, optional next date), Postpone (reason, counted), Cancel. Managers who see
everyone can switch on "Show whole team".

## Dashboard

- Top strip: live counts (active leads → opportunities → open quotations → open sales orders → clients →
  unpaid invoices → to-dos due), each a link.
- **Show** buttons: Sales · Finance · Team & management · Service & delivery (one or several; remembered on
  that device; the export follows them). Period buttons and salesperson/state filters apply to all sections.
- Sales Executives/Managers see only their own numbers.

## Optional features (Settings → Features)

All on by default; switching one off hides it everywhere and keeps data already entered (R19):
advance & proforma · cheque/PDC tracking · credit notes · dispatch & challan · renewals · ageing & forecast ·
targets · several contacts · client documents · quotation validity. New optional features must get a switch
(`src/lib/features.ts`).

## Lists (single source of truth)

Fixed lists live only in `src/lib/constants.ts`: lead sources, designations, follow-up types, own to-do
types, competitors, lost reasons, stages + probabilities, payment modes, document categories, contact roles.
States and cities live in the database (Settings → Locations). The form, the Excel template and the upload
read the same lists, so they can't drift apart (R9, R10).

## Look and devices

- Look follows the client's prototype (colours, fonts Bricolage Grotesque + Figtree, cards, coloured strips).
- Every screen must work on a computer and on a phone (~390px): no sideways page scrolling, big tap targets,
  pop-ups as bottom sheets on phones (R7, R21).
- Dates always DD/MM/YYYY; money in ₹ with Indian grouping (L / Cr on summaries); "today" is India time.

## Data rules

- No fictional sample data is ever seeded. No passwords or secrets in code or docs.
- Test data was cleared on 1 Oct before client testing (R23); the "Clear test data" page was then removed.
