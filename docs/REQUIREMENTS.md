# Client requirements log

Every request from the owner (and, through the owner, from Wonder Learning), in the order it was made,
with what was decided and where it lives. **Add new requests at the bottom** and keep the status column
current. Plain language first; file paths are for developers.

Status: ✅ done · 🟡 partly done / provisional · ⏳ waiting on the client · ❌ dropped

> Never copy passwords, database addresses or other secrets into this file. They live only in Vercel
> (Settings → Environment Variables) and in the owner's own notes.

---

## R1. Phase 1 brief: Sales & Leads (30 Sep 2026)

Source: the owner's original brief plus the prototype `wonder-learning-crm.html` (design and behaviour
reference, not copied). Build only Sales & Leads first; make it easy to extend to clients, orders,
invoices, print press and services later.

| # | Requirement | Status | Notes / where |
|---|---|---|---|
| 1.1 | Stack: Next.js + TypeScript, PostgreSQL + Prisma, login with email/password, Tailwind matching the prototype's look | ✅ | `package.json`, `src/app/globals.css` (prototype colour tokens) |
| 1.2 | Roles with role-based visibility (salesperson sees only their own; managers/director see all) | ✅ | Changed later, see R3/R4. `src/server/access.ts`, `src/lib/permissions.ts` |
| 1.3 | Leads with the prototype's "New lead" fields, lists from the prototype, State → City dependent | ✅ | Fields changed later, see R8. `src/app/(app)/leads/lead-form.tsx` |
| 1.4 | Disqualify a lead with a reason (LOST list) | ✅ | `disqualifyLead` in `src/server/leads.ts` |
| 1.5 | Opportunities separate from leads; stages Interested → Demo Scheduled → Proposal Sent → Negotiation → Won / Lost; probability per stage (20/35/55/75/100/0) | ✅ | `src/server/opportunities.ts`, `STAGE_PROBABILITY` in `src/lib/constants.ts` |
| 1.6 | Lost needs reason + remarks (competitor optional); Won and Lost are final | ✅ | |
| 1.7 | Follow-up tasks auto-created when a lead is saved, when a deal moves to Proposal/Negotiation, on conversion | ✅ | `src/server/tasks.ts`, `src/server/leads.ts` |
| 1.8 | Screens: login, dashboard, leads list, lead page, pipeline board (drag + Stage dropdown), follow-ups | ✅ | `src/app/(app)/*` |
| 1.9 | Show the database design first and wait for approval | ✅ | Approved 30 Sep |
| 1.10 | **No fictional sample data.** Only real master lists are seeded | ✅ | `prisma/seed.ts` |
| 1.11 | **No passwords in the code.** First passwords come from environment variables | ✅ | `prisma/seed-users.ts` (reads `SEED_PASSWORD_*`) |

## R2. The real team (30 Sep)

| Person | Role | Login email |
|---|---|---|
| Gautami Varma | Admin | admin@wonderlearning.in |
| Viren Dogra | Sales Head | virend@wonderlearning.in |
| Rohan Jayde | Sales Manager | rj@wonderlearning.in |
| Vinay Choure | Sales Manager | vinay.wonderlearning@gmail.com |
| Harshal Jadhav | Sales Manager | harshal.wonderlearning@gmail.com |

✅ Seeded by `prisma/seed-users.ts`. More people (Sales Executives) are added in the app: Settings → Users.

## R3. Sales Head sees everyone (30 Sep)

"Sales head should Viren should see everyone's leads not Rohan." ✅ Sales Head, Admin and Director see all
sales data; Sales Managers and Sales Executives see only their own.

## R4. Sales Head manages products (30 Sep)

"Also products access to Viren as well." ✅ `canManageProducts` = Director, Admin, Sales Head.

## R5. Deployment for a non-developer (30 Sep)

✅ Free Vercel (website) + Neon (database, Singapore). Plain-language steps in `DEPLOY.md`.
Live address: **wonder-learning-crm.vercel.app**. Pushing to branch `claude/kind-pasteur-jpzqm5` deploys
automatically. Vercel "Deployment Protection" must be off so testers don't need a Vercel login.

## R6. Bug: typing made forms jump to the top (30 Sep)

✅ Fixed in every form (New lead, Log interaction, Opportunity, Tasks). Modals keep focus while typing.

## R7. Mobile (1 Oct)

"First we will fix it on web … after that for every phase consider mobile layout as well." ✅ Rule recorded
in `CLAUDE.md`: every screen must work at desktop and phone width (~390px). The Phase 1 mobile backlog is done.

## R8. Lead form changes from the client's document "Current_publication.docx" (1 Oct)

| Change | Status |
|---|---|
| Current Publication/Curriculum becomes free text | ✅ |
| Remove "Interested in" and "Remarks" from the lead | ✅ |
| Rename Temperature → Category (later moved to the opportunity, see R16.1) | ✅ |
| All dates shown DD/MM/YYYY | ✅ (`src/components/date-input.tsx`) |
| New follow-up types: Call, WhatsApp/Message, Email, School Visit, Online Demo | ✅ |
| A lead saved as **Qualified** becomes an opportunity automatically | ✅ |
| An **Opportunities** list page (besides the board) | ✅ |
| **Convert to client** on a Won deal, with onboarding (Onboarding → Active) | ✅ |

## R9. Bulk lead upload via Excel (1 Oct)

✅ "Download template" and "Upload leads" on the Leads screen. Full rules in
[DOWNLOADS_AND_TEMPLATES.md](DOWNLOADS_AND_TEMPLATES.md#lead-excel-template). Key points:
- The template is generated fresh on every download (never a stored file), with hard dropdowns, a
  dependent City list, Assigned To from active users, a Read me tab and an example row.
- The upload re-checks every row, skips duplicates (same school name + mobile), and reports every
  skipped row with its reason.
- **One source of truth:** the form, the template and the upload read the same lists
  (`src/lib/constants.ts`; states/cities from Settings → Locations).

## R10. States and cities managed by Admin (1 Oct)

"Allow admin to add city or state and it should reflect in Excel template and form." ✅ Settings → Locations.

## R11. Quotations (1 Oct)

Client's format: `Quotation_Format.pdf` (3 pages). ✅
- "Create quotation" on an opportunity (and later on a client); product list; **MRP and Price typed by hand**,
  no fixed price, **no discount column**; ₹ symbol.
- Send by Download, WhatsApp (link) or Email (once email is set up). Sending moves the deal to Proposal Sent.
- Pages 2–3 are standard text, editable in Settings → Quotation.
- Numbering QUO/YYYY/MM/NNN.

## R12. After onboarding: orders and money (1 Oct)

"Sales order, invoice, payment received, partial payment, outstanding, reminder of outstanding." ✅
Owner's answers that shaped it:
- GST: "GST is 0% for educational product, still you can keep." GST % is per line. 🟡 **Invoice layout is
  provisional until the client sends their invoice sample.**
- Payments: customers pay in several instalments; a school can have several orders and quotations.
- Reminders: in follow-ups, one-click WhatsApp and email buttons.
- Who: also the client's salesperson.

## R13. Moving to the client's own domain later (1 Oct)

Answered: **Option A** keep Vercel and add the client's domain (simplest, see `DEPLOY.md` step 5).
**Option B** move to the client's own server (VPS). The whole project is in GitHub, so it can be
transferred either way. ⏳ Decide after the ~15-day trial.

## R14. Android app, strictly online (1 Oct)

✅ "Download app" button (sidebar and `/download-app`), APK in `public/downloads/wonder-crm.apk`.
The app opens the live site, never caches, and shows "No internet" when offline. See `android/README.md`.

## R15. Products, convert buttons, receipts (1 Oct)

| Request | Status |
|---|---|
| Add and delete products (admins) | ✅ Settings → Products |
| "Convert to opportunity" on the lead page, in the leads list, and after logging an interaction | ✅ |
| Payment receipt (PDF) with send options (WhatsApp / email / download) | ✅ RCPT/YYYY/MM/NNN |

## R16. Batch of 10 (1 Oct)

| # | Request (owner's words, shortened) | Status | Notes |
|---|---|---|---|
| 1 | Remove Hot/Warm/Cold from the lead; choose it when converting; it belongs to the opportunity | ✅ | Stored as `Opportunity.temperature`, shown as "Category" |
| 2 | PO upload; the same PO number on sales order and invoice | ✅ | See R17 |
| 3 | Partial payment → "next payment promise date" that shows in follow-ups | ✅ | |
| 4 | To-do for every user: scheduled items + own items (internal meeting, document preparation…), Done / Postpone / Cancel | ✅ | Menu "To-do" |
| 5 | Ledger tab, one client or all clients, like a standard CRM | ✅ | Menu "Ledger" |
| 6 | PDF and Excel export wherever there is a report | ✅ | Rule in `CLAUDE.md` |
| 7 | Templates and custom quotation samples will be provided by the client | ⏳ | |
| 8 | Number ranges for PO, quotation, sales order "all in sync" | 🟡 | Today: QUO/SO/INV/RCPT/PI/CN/DC per month. ⏳ Waiting for the client's preferred formats |
| 9 | "Standard CRM but with our requirements only" | ✅ | Guiding rule |
| 10 | When creating a sales order, show the quotation's creation time (H:M:S AM/PM) | ✅ | |

## R17. PO template (1 Oct)

"Our clients don't have a standard PO … create PO template button … they sign and seal and send back …
upload PO button and PO number while creating sales order." ✅
- **Send PO template:** a PO form in the school's name from a sent quotation (blank PO number/date,
  signature and seal boxes). WhatsApp link or download.
- **Upload signed PO:** PO number + file, creates the sales order. PO number prints on the invoice.
- Made a visible two-step box on the client page after "PO template is not added".

## R18. Real logo (1 Oct)

✅ Wonder Learning logo from the client's templates replaces the placeholder (`public/brand/wonder-logo.png`).

## R19. CRM expert QC (1 Oct) and "fix A and B, keep it simple, make them switchable" (1 Oct)

Review list and outcome:

**A. Fix before go-live**
| # | Item | Status |
|---|---|---|
| A1 | Edit client details; change the assigned salesperson | ✅ |
| A2 | Only Admin / Sales Head / Director can cancel invoices, delete payments, make credit notes, clear/bounce cheques | ✅ |
| A3 | Duplicate warning on New lead (same mobile, or same school in the same city) | ✅ |
| A4 | Lock after 5 wrong passwords (15 min); Forgot password | ✅ (reset email needs email set up) |
| A5 | Hand over all of a leaving person's work in one step (Settings → Users) | ✅ |
| A6 | Switch on email (needs the client's email account details) | ⏳ |
| A7 | Phone fixes (pipeline width, duplicate title, lead header wrap) | ✅ |
| A8 | Paid hosting before real money data (Vercel Pro, Neon with longer backups) | ⏳ owner's decision |

**B. Missing for the business.** All built ✅ and each can be switched off in **Settings → Features**:
B1 advance + proforma invoice · B2 cheque/PDC tracking · B3 credit notes · B4 dispatch + delivery challan +
proof of delivery · B5 academic-year renewals · B6 outstanding ageing + collection forecast · B7 sales &
collection targets · B8 several contacts per school (payments contact) · B9 client documents ·
B10 quotation validity / expired. ❌ Not done (optional, not requested): manager approval for low prices.

**C. Later ideas (not started):** morning summary message; automatic lead capture (website, Facebook,
IndiaMART); WhatsApp Business API; To-do calendar view; "untouched 15+ days" list; change history;
an Accounts role; full GST invoice fields (with the invoice template). The global search box from C
was built in R22.

## R20. Lead feedback with screenshots (1 Oct)

| # | Request | Status |
|---|---|---|
| 1 | Lead date and time; newest first; sort control | ✅ "Added" column; sort: Newest / Oldest / Next follow-up |
| 2 | "Assigned to", not "Owner", wherever it means the salesperson | ✅ Screens and all exports. "Owner" stays only for the school's owner ("Owner / contact person") |
| 3 | Bigger "All leads" back link | ✅ |
| 4 | Contact details in the empty space on the lead page | ✅ |
| 5 | (point 5 came through empty) | ⏳ ask the owner |

## R21. "Buttons are not clickable in mobile view" (1 Oct)

✅ Full phone tap test (every button, Admin and Exec). Real-phone causes fixed: pop-ups are bottom sheets
sized to the visible screen; no keyboard pop-up on open; whole page scrolls on phones; 16px fields (no iPhone
zoom); calendar icon opens the phone's date picker; pipeline cards don't block scrolling; "Change a field to
save" hint on greyed Save buttons. ⏳ If anyone still sees it, get the screen, button, phone model and
whether it was the browser or the app.

## R22. Make the UI look like the prototype (1 Oct)

"The client is not happy with our UI … without changing anything make UI better." ✅ Same features, new look:
top bar with search, "+ Add" and alerts bell; coloured lifecycle strip on the dashboard; period buttons;
client page with header card, % collected ring, summary strip and tabs; lighter row buttons.

## R23. Clear test data before client testing (1 Oct) → then remove the button (1 Oct)

✅ Data typed during testing was cleared on the live site by the owner (logins, products, states/cities,
quotation template and feature switches kept; numbering restarted). ✅ The "Clear test data" page was then
removed so it can't be pressed by accident.

## R24. Dashboard section buttons (1 Oct)

"Buttons like sales, finance, management, service … click one or multiple and see that data only." ✅
**Show:** All · Sales · Finance · Team & management · Service & delivery. Several can be picked, the choice
is remembered on that device, and the PDF/Excel export follows it. `src/lib/dashboard-sections.ts`.

## R25. Keep documentation and templates up to date (2 Oct)

"Maintain every document … client requirement, our push and commit … so you'll not go through every chat
every time … always maintain every download, upload and template as per updated development." ✅
- This `docs/` folder. Update it in the same commit as the change (rule in `CLAUDE.md`).
- Lead template fixed: the category column is now "Opportunity Category (if Qualified)", required only for
  Qualified rows (the upload enforces it, like the form); clearer notes; corrected example row.
- Dashboard export follows the chosen sections.
- Checklist for every download/upload: [DOWNLOADS_AND_TEMPLATES.md](DOWNLOADS_AND_TEMPLATES.md).
