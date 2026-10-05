# Downloads, uploads and templates

Every file the CRM produces or accepts, where it comes from in the code, and what to re-check when the app
changes. **Rule: when a field, label, list or rule changes on a screen, update every file below that shows
it in the same commit, and tick the checklist at the bottom.**

Nothing here is a stored, hand-made file. Every document is generated from the live data and code at the
moment it's downloaded, so a change in the code shows up in the next download. (The only stored files are
the Android APK and the logo.)

---

## Lead Excel template

- **Where:** Leads → **Download template** (`/api/leads/template`).
- **Code:** `src/server/lead-excel/columns.ts` (columns, headers, notes) → `template.ts` (builds the .xlsx) →
  `import.ts` (reads it back). Tests: `tests/lead-excel.test.ts`.
- **Tabs:** `Leads` (one row per lead; row 2 is a grey example that the upload skips), `Read me` (plain
  instructions), `Lists` (hidden; feeds the dropdowns).
- **Columns** (same order and required fields as the New lead form; * = required):
  School Name* · Owner/Contact Person Name* · Designation · Mobile Number* · Email ID · State* · City* ·
  Area/Location · Address · Current Publication/Curriculum · Current Student Strength · Number of Branches ·
  Lead Source* · Reference Name · Lead Status · **Opportunity Category (if Qualified)** · Assigned To* ·
  Next Follow-up Date* · Follow-up Type · Follow-up Remark
- **Dropdowns (hard, "stop" style):** Designation, State, City (follows the row's State), Lead Source (incl. "Social Media"; Facebook/Instagram are refused), Lead
  Status (New / Contacted / Qualified), Opportunity Category (Hot / Warm; R34), Assigned To (active
  sales people at download time), Follow-up Type. Dates DD/MM/YYYY. Whole numbers for strength and branches.
- **Where the lists come from:** `src/lib/constants.ts` (designations, sources, statuses, categories,
  follow-up types) and the database (states and cities from Settings → Locations; people from Settings → Users).
  The form, the template and the upload all read these same lists; never type a second copy.
- **Rules the upload enforces** (`import.ts`), the same as the New lead form:
  - header row must match exactly (an old template is refused, naming the changed column);
  - required fields; values must be in the lists; City must belong to State; 10-digit mobile (+91 / 0 in front removed); valid date;
  - **Qualified rows need an Opportunity Category**; the category is ignored on other rows (it belongs to the opportunity);
  - Reference Name kept only for Reference / Existing School Reference;
  - Sales Executives / Managers can only assign leads to themselves;
  - same school name + mobile as an existing lead (or an earlier row) → skipped as a possible duplicate;
  - up to 1,000 rows; each created lead gets its first follow-up task, like a lead added on screen;
  - the result lists created rows and every skipped row with its reason.
- **What's not in the template on purpose:** "Interested in", "Remarks" and "Temperature" (removed from the
  lead in R8/R16, see REQUIREMENTS.md).

## Report exports (PDF and Excel)

The **PDF / Excel** buttons on each list. Route `/api/export/<report>?format=pdf|xlsx&<the screen's filters>`.
Exports follow the screen's **From – to** dates and the **financial year chosen after login** (R31), and print both under the title (R28).
Code: `src/server/reports/index.ts` (one builder per report, using the screen's own query and access rules),
`render.ts` (Excel), `pdf.tsx` (PDF). Tests: `tests/ledger-reports.test.ts`.

| Report | Screen | Columns / sections |
|---|---|---|
| `leads` | Leads | Lead, Added (date + time), School, Contact, Mobile, City, Source, Status, Assigned to, Next follow-up |
| `opportunities` | Opportunities | Opp., School, Contact, City, Stage, Category, Value, Chance %, Expected close, Next action, Assigned to |
| `clients` | Clients | Client, School, Contact, Mobile, City, Status, In 2026-27 (standing + order value; "Last order" for All years), Since, Assigned to |
| `outstanding` | Outstanding | Summary, ageing, expected collections, then each invoice: Invoice, Date, School, PO No., Due, Total, Received, Balance, Status, Assigned to |
| `ledger` | Ledger, and the client page's Ledger tab | One client: Date, Ref. No., PO No., Particulars, Debit, Credit, Balance. All clients: Client, School, City, Assigned to, Opening, Invoiced, Received, Closing |
| `todo` | To-do | When, Date, Time, Type, Task, Related to, Priority, Postponed, Assigned to |
| `approvals` | Accounts → Payment approvals (Director / Admin) | Waiting for approval, then decided in the last 30 days: School, Against, Amount, Paid on, Mode / ref., Recorded by, Decision, Receipt / reason, By |
| `expenses` | My expenses (own) / Accounts → Expenses (everyone, with filters) | No., Date, Person, Kind, What for, City, Paid by (incl. Company card), Bill (Yes / No: description), Amount, Status, Paid back; total |
| `finance` | Accounts → Company finance | Summary (money in / out / net, bank & cash), by month, where the money came from / went, balances today, still to come in, still to pay, income and expense, GST summary; for the chosen year or From–To |
| `bills` | Accounts → Bills to pay | No., Bill date, Supplier, Their no., For, Description, Before GST, GST, Total, Paid, To pay, Due, Status; totals (follows the To pay / Waiting chips and dates) |
| `salaries` | Accounts → Salaries | Month, Employee, Gross, Deductions, Take-home, Paid on, From (account), Mode / ref., Status; totals of approved |
| `book` | Accounts → Account books | The chosen account: Date, Type, Particulars, In, Out, Balance, Matched (opening and closing in the title line); then other money in / out |
| `dashboard` | Dashboard | Follows the **Show** buttons: Sales (key numbers, pipeline by stage, lead sources, biggest deals) · Finance (collected/outstanding/overdue/cheques, expenses, and for Accounts bank & cash and bills to pay; ageing, expected collections) · Team & management (win rate, lost, interactions, team table, targets, lost reasons, competitors) · Service & delivery (follow-ups, orders to deliver, kits in transit, onboarding, renewals, lists) |

Wording rule: the salesperson is always **"Assigned to"**; "Owner" only means the school's owner.

## Business documents (PDF)

Quotation, proforma, invoice, credit note and challan share the Wonder Learning header/footer from
`src/server/quotation/pdf.tsx` and number per month (/001 each month). The **PO template, receipt and kit
checklist follow the client's own sample files** (R27): their texts are in Settings → Documents, and receipt
and PO numbers run per financial year with starting-number settings.

| Document | Number | Made from | Download / share | Code |
|---|---|---|---|---|
| Quotation (3 pages, client's format) | QUO/YYYY/MM/NNN | Lead, opportunity or client (price per kit includes the hidden transport; transport is never printed) | `/api/quotations/<id>/pdf`; public link `/q/<token>` | `src/server/quotation/pdf.tsx`, text in Settings → Quotation (`content.ts`) |
| Sample quotation (to check Settings text) | QUO/…/000 | Settings → Quotation | `/api/quotations/sample` (Admin) | same |
| PO template (client's PO format; school signs and stamps; Material Exclude lists removed kit items; kit checklist attached from page 2) | PO/2627/N, given on first save | Sent quotation + details saved in "Send PO template" (`Quotation.poDetails`) | `/api/quotations/<id>/po-template`; public `/q/<token>/po` | `src/server/finance/po-pdf.tsx`, `po.ts`; texts in Settings → Documents |
| Kit checklist (client's checklist layout, one coloured page per class) | — | Products with contents (no prices printed); for a quotation, the kits as changed for that school | `/api/products/checklist[?ids=]`; public `/q/<token>/checklist` (the quotation's kits) | `src/server/products/checklist-pdf.tsx`, `checklist.ts` |
| Signed PO (uploaded file) | school's PO No. | Upload signed PO | `/api/sales-orders/<id>/po` | `src/server/finance/po.ts` (PDF or photo, max 4 MB) |
| Proforma invoice | PI/YYYY/MM/NNN | Sales order | `/api/sales-orders/<id>/proforma` | `invoice-pdf.tsx` (proforma title) |
| Invoice 🟡 | INV/YYYY/MM/NNN | Sales order | `/api/invoices/<id>/pdf`; public `/i/<token>` | `src/server/finance/invoice-pdf.tsx`. **Provisional layout until the client's invoice sample arrives** |
| Payment receipt (client's receipt format; only after Accounts approval) | N/26-27 (financial year), given on approval | Payment / advance | `/api/payments/<id>/receipt`; public `/r/<token>` | `receipt-pdf.tsx`; address and signatory in Settings → Documents |
| Credit note | CN/YYYY/MM/NNN | Invoice | `/api/credit-notes/<id>/pdf` | `credit-note-pdf.tsx` |
| Delivery challan | DC/YYYY/MM/NNN | Dispatch | `/api/dispatches/<id>/challan` | `challan-pdf.tsx` |

Sales orders are SO/YYYY/MM/NNN (on screen; the number prints on proforma and invoice together with the PO No.).

## Uploads

| Upload | Where | Accepts | Code |
|---|---|---|---|
| Lead Excel | Leads → Upload leads | the downloaded .xlsx template only | `/api/leads/import`, `src/server/lead-excel/import.ts` |
| Expense bills | My expenses / Accounts → Expenses → Add expense | Photos (shrunk in the browser) or PDF, up to 4 per expense, 4 MB each | `/api/expenses`, `src/server/expenses.ts`; viewed at `/api/expenses/files/<id>` |
| Supplier bill photo / PDF | Accounts → Bills to pay → Add bill | One photo (shrunk) or PDF, 4 MB | `/api/company/bills`, `src/server/company.ts`; viewed at `/api/company/files/bill/<id>` |
| Voucher for other money in / out | Accounts → Account books → Other money in / Other payment | One photo (shrunk) or PDF, 4 MB (optional) | `/api/company/entries`; viewed at `/api/company/files/entry/<id>` |
| Signed PO | Client → Purchase orders → Upload signed PO | PDF or photo, max 4 MB | `src/server/finance/po.ts` |
| Client documents, proof of delivery | Client → Documents tab; Dispatch → Mark received | PDF or photo, max 4 MB | `/api/clients/<id>/files`, `src/server/files.ts` |

Files are stored inside the database (no separate file storage to set up).

## Other files

- **Android app** `public/downloads/wonder-crm.apk`, served by `/download-app`. Rebuild with
  `android/build.sh` when the site address changes (see `android/README.md`).
- **Logo** `public/brand/wonder-logo.png` (from the client's templates); embedded copy for PDFs in `src/server/finance/logo-image.ts`.
- **Project documents** (`docs/*.md`, `DEPLOY.md`) are also shown in the CRM at Settings → Project documents.

## Waiting on the client

- Invoice sample (to replace the provisional invoice layout; add GSTIN, HSN/SAC, bank details, place of supply).
- Preferred number formats for quotation / sales order / invoice ("ranges in sync"); receipt and PO already follow the client's books.
- Any customised quotation samples.
- Opening balances for the ledger (format to be agreed; not loaded yet).

---

## Checklist for every change

When a field, label, list or rule changes, check each of these and fix what's affected **in the same commit**:

- [ ] New lead form (`lead-form.tsx`) and lead page
- [ ] Lead Excel template: columns, notes, example row, Read me text (`src/server/lead-excel/`)
- [ ] Lead upload rules match the form's rules (`import.ts`) and `tests/lead-excel.test.ts` covers them
- [ ] Report exports for every screen showing the field (`src/server/reports/index.ts`)
- [ ] PDFs that print it (quotation, PO template, kit checklist, proforma, invoice, receipt, credit note, challan)
- [ ] WhatsApp / email message texts that mention it
- [ ] `docs/WORKFLOW.md` (the How it works guide) if a screen, button or step changed
- [ ] `docs/REQUIREMENTS.md` (status) and `docs/CHANGELOG.md` (what changed)
- [ ] Download each changed file once and open it to look (dev: `npm run build && npm start`, log in, download)
