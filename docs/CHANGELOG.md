# Change log

Every change pushed to GitHub (branch `claude/kind-pasteur-jpzqm5`, which deploys to
wonder-learning-crm.vercel.app automatically). Newest first. **Add an entry with every push**: date, short
commit id, what changed in plain words, and the requirement it answers (R… in `REQUIREMENTS.md`).
`git log --oneline` shows the full list.

## 3 Oct 2026

- `PENDING` **Renewals by financial year.** Renewal opportunities are for the next FY (April – March), valued at
  this FY's orders; "AY" → "FY" on screens. (R32)
- `e4ae6e7` **Financial year.** After login, choose the year (2026-27 …) or All years; it shows in the top bar and
  can be changed any time. Lists, dashboard, ledger and exports follow it; open items carry over. Clients stay
  listed every year with their standing (Renewed / New / Not renewed …) and filter chips. Phone top bar fix. (R31)
- `878a273` **To-do opens on the calendar.** Double-click a day (or an hour in the week) to add a to-do on it;
  phones get a + Add button per day. List view stays available. (R30)
- `8261a5f` **Transport and kit changes on quotations.** Hidden transport per kit on any quotation line (inside
  the price, never printed). Change kit items: take items out or add optional items, with MRP/price following
  the item prices; the checklist follows. Prices only from the Excel: class-kit prices from the sample PO cleared;
  fixed freight ₹100 removed from Focus (₹2,854) and Plus (₹3,144). Kit items carry their prices. (R29)
- `c6f240b` **Price list and filters.** Nursery Core/Focus/Plus kits and 33 optional items loaded with school
  price and MRP; products have an MRP that fills quotations; conflicts list in `docs/PRICING.md`. Create
  quotation on a lead (moves to the opportunity on conversion). Facebook/Instagram merged into Social Media.
  Pipeline fits one screen. Filters default to All. To-do calendar (month/week). From–to date filter on
  leads, opportunities, clients, outstanding and To-do, also in the exports. (R28)
- `d1d1d3b` **Client's own templates and kit-wise products.** Products are now the four class kits
  (with contents from the client's checklist) plus seven optional add-ons; the seven sample services are
  removed (one-time migration). New kit checklist PDF. Receipt and PO template rebuilt in the client's
  formats; receipt numbers 1/26-27 and PO numbers PO/2627/1 with starting-number settings; Upload signed PO
  pre-fills PO number, kits and delivery date. Settings → Quotation renamed **Documents** (quotation text +
  PO/receipt settings). **Settings → Project documents** shows the docs inside the CRM. (R26, R27)

## 2 Oct 2026

- `a323882` **Project documents.** Added `docs/`: requirements log, business rules, downloads &
  templates checklist, status, this change log. `CLAUDE.md` now says to keep them updated. (R25)
- `59a80eb` **Downloads match the current app.** Lead Excel template: "Opportunity Category (if Qualified)"
  is required only for Qualified rows, and the upload now enforces that like the form; clearer column notes;
  corrected example row; Read me explains "Assigned To". Upload screen asks for a fresh template.
  Dashboard PDF/Excel follows the chosen Show sections. (R25)

## 1 Oct 2026

- `aae531d` Removed the **Clear test data** page. Dashboard **Show** buttons: Sales, Finance, Team &
  management, Service & delivery; pick one or several; remembered on the device. (R23, R24)
- `da347fd` Temporary **Clear test data** page (Admin/Director) to empty testing data before client
  testing; used once, then removed in `aae531d`. (R23)
- `0087b93` **Prototype look:** top bar with search, "+ Add" and alerts bell; dashboard lifecycle strip and
  period buttons; client page header card with % collected ring, summary strip and tabs; lighter row buttons. (R22)
- `bfc2356` **Phone taps:** pop-ups as bottom sheets sized to the screen, no keyboard on open, whole page
  scrolls on phones, 16px fields (no iPhone zoom), calendar icon opens the phone's picker, pipeline scrolls,
  "Change a field to save" hint. (R21)
- `62c4fb0` Leads: **Added** date/time column and sort; **"Assigned to"** instead of "Owner" for the
  salesperson everywhere; contact card on the lead page; bigger back links. (R20)
- `ba2cfec` Docs: feature switches, money rules, new modules.
- `cb74a7b` Renewals, outstanding ageing & forecast, targets, quotation validity / expired. (R19 B5–B7, B10)
- `c971a57` Dispatch & delivery challan; client documents; extra contacts per school. (R19 B4, B8, B9)
- `5975f80` Advance payments and proforma invoice; cheque/PDC tracking; credit notes. (R19 B1–B3)
- `dfaeec3` Hand over work; phone fixes (pipeline width, duplicate title, lead header). (R19 A5, A7)
- `2071774` Duplicate lead warning; login lock after 5 tries; forgot password. (R19 A3, A4)
- `94b1f6a` Edit client details; money corrections only for Admin/Sales Head/Director; **Settings → Features**
  switches. (R19 A1, A2)
- `1f68239` Wonder Learning logo. (R18)
- `c511371` PO template made a visible two-step box on the client page. (R17)
- `dd1cbe5` Test clean-up.
- `5c19732` **Ledger** and PDF/Excel export on every report. (R16.5, R16.6)
- `e8cadb9` **To-do** for every user (own items, Done/Postpone/Cancel); payment promise date. (R16.3, R16.4)
- `489f219` Category moved to opportunities; **purchase orders** (PO number on SO and invoice); quotation
  time on sales orders. (R16.1, R16.2, R16.10)
- `2a01e49` Add/delete products; Convert to opportunity buttons; payment receipts. (R15)
- `ae04920` **Android app** (online only) and Download app page. (R14)
- `932a1f6` **Sales orders, invoices, instalment payments, outstanding, reminders.** (R12)
- `7487cf0` Expected deal value drives pipeline totals.
- `32bccfc` Opportunity panel: removed "Items of interest"; ₹ on quotation amounts. (R11)
- `c2d07ce` **Quotations**: create, edit, send, revise in the client's 3-page format. (R11)
- `5f63a17` **Bulk lead upload via Excel.** (R9)
- `c6557e3` Admin-managed states and cities, strict State/City everywhere. (R10)
- `b2ac09d` Lead form changes from the client's document; Opportunities list; convert won deals to clients. (R8)
- `6934e65` Recorded the web + mobile rule and the Phase 1 mobile backlog. (R7)

## 30 Sep 2026

- `918d80a` Fixed forms jumping to the top on every keystroke. (R6)
- `beaea58` Sales Head manages products and prices. (R4)
- `ecbec40` Sales Managers see only their own data; Sales Head, Admin, Director see all. (R3)
- `c38db8f`, `fc02f8d` One-click Vercel + Neon deployment and plain-language guide (`DEPLOY.md`). (R5)
- `b5211b2` **Phase 1 app:** login, access control, leads, pipeline, follow-ups, dashboard. (R1)
- `ec2f3a1` Admin and Sales Head roles; seed the real team. (R2)
- `1a28767` **Phase 1 database design** (approved before building). (R1)
