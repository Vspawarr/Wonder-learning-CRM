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

## R26. Project documents in the deployment too (3 Oct)

"Push requirement file and all md files in git or in our deployment." ✅ They are in GitHub (`docs/`), and now
also readable inside the live CRM: **Settings → Project documents** (Director / Admin), with tabs for Status,
Requirements, Business rules, Downloads & templates, Change log and Going online. `src/app/(app)/admin/docs/`.

## R27. The client's own templates and kit-wise products (3 Oct)

Owner shared three files: `WLI_Checklist_2025-26.pdf` (kit contents per class), `Payment_Receipt_MSMPS…pdf`
(their receipt 117/26-27) and `PO-_Caring_Hood_Preschool.pdf` (their PO/2526/92). "New templates update this if
exists replace with this new one … products kit wise analyse this and check where to fix this remove our sample
products if needed."

| Change | Status | Notes |
|---|---|---|
| Products are now one **student kit per class**: Play Group (₹2,360), Nursery (₹2,760), LKG / Jr. KG (₹2,975), UKG / Sr. KG (₹3,175), GST 0% | ✅ | Prices taken from the Caring Hood PO as starting values; change in Settings → Products. `src/lib/kits.ts` |
| Each kit stores its **contents** from the checklist (Common Kit 19 objects, Academic Kit, optional subjects, Resource Kits) and its colour | ✅ | Editable in Settings → Products ("## Group \| subtitle", one item per line) |
| 7 **optional add-ons** from the quotation's Optional list (Hindi Swar / Vyanjan / Shabad Gyan / Matra Gyan TB & NB, Cursive Text Book, Phonics Reader, Nursery Practice Notebooks) | ✅ | No price yet ⏳ |
| The 7 sample services (Curriculum License … Branding Support) **removed** | ✅ | One-time migration `20261009090000_class_kits`; only removed where the name was still the sample's, so products the team added are kept |
| **Kit checklist PDF** in the client's layout (one coloured A4 page per class) | ✅ | Settings → Products / Documents; sent with the PO template on WhatsApp (`/q/<token>/checklist`) |
| **Receipt** replaced with the client's format: logo + office address (Chh. Sambhajinagar), Received From, amount in words, on account of, paid by (cheque no., bank, date), Total PO Value / Payment Received / Balance Due, signatory Mr. Viren Dogra | ✅ | Signature is printed as the name only, not a signature image (see STATUS) |
| Receipt numbers like their book: **117/26-27** (running through the financial year), with a "next receipt number" setting to continue from their book | ✅ | Settings → Documents → PO template, receipt & numbering |
| **PO template** replaced with the client's PO format: academic year, PO No., seller (Pune office) and buyer blocks, requisitioner, expected delivery, ship via, shipping terms, kits demanded / supplied, rate, amount, remarks, Material Exclude → Refer Checklist, terms, advance cheque/DD table, customisation YES/NO, bank account details, signature boxes, executive contact line | ✅ | The details are filled in the "Send PO template" window and saved with the quotation |
| PO numbers **PO/2627/93** style, given by the CRM when the PO template is first saved, with a "next PO number" setting; **Upload signed PO** then fills in the PO number, kits and delivery date | ✅ | |
| All these texts (addresses, bank, terms, customisation list, signatory) editable in **Settings → Documents** | ✅ | |

## R28. Price list, lead quotations, Social Media, pipeline, filters, calendar (3 Oct)

Owner shared `Pric_list.xlsx` and `cost_for_nursery.xlsx`: "Analyse this 02 excel file go through every sheet
it has. Items and price will be done; if any conflict make list and give me we will confirm with client. Also
we should make available quotation/create quotation button in lead as well if it doesn't converted in
opportunity, cause some schools ask quotation in first attempt. Also in lead source Facebook, Instagram and
all social media platform merge as Social media. Make pipeline tab vertical or should able to look in single
frame, no need to scroll horizontal. Default active filter button should be All. Try to make to-do button
like calendar like Google calendar or Teams calendar. Also in filters date filter should be there like from
this date to xx date (custom)."

| Change | Status | Notes |
|---|---|---|
| Price list loaded: **Nursery Core / Focus / Plus kits** (K05–K07, with school price, MRP and contents) and **33 optional items** (O01–O33) | ✅ | One-time migration `20261010090000_price_list`; replaced the 7 unpriced add-ons (A01–A07) |
| Products have an **MRP**; adding a product to a quotation fills in MRP and price | ✅ | Settings → Products |
| **Conflicts list** for the client (22 points) | ⏳ waiting on client | [PRICING.md](PRICING.md), also Settings → Project documents → Pricing & conflicts |
| **Create quotation on a lead** (not yet converted); moves to the opportunity when the lead is converted; sending it sets a New lead to Contacted | ✅ | Lead page → Quotations card |
| Lead source **Social Media** replaces Facebook and Instagram (existing leads updated) | ✅ | Migration `20261010100000_social_media_source`; Excel template follows |
| **Pipeline** fits the screen: 6 columns in one row on a computer, 3 on a tablet, one under the other on a phone | ✅ | No sideways scrolling |
| Default filter **All** on leads, opportunities and reports | ✅ | "Active" is still one tap away |
| **To-do calendar**: Month and Week views (week with hours 8 AM–8 PM), Today / ‹ / ›, colours for school follow-up, own to-do, overdue, done; click an item to Done / Postpone / Cancel. Phones: dots + day agenda | ✅ | To-do → Calendar |
| **From – to date filter** on leads (Added), opportunities (Added), clients (Client since), outstanding (Invoice date) and To-do list (Due); PDF/Excel follow it | ✅ | |

## R29. Transport by location, prices only from the Excel, kits changed per school (3 Oct)

"Transportation cost is different for different location so we will add that but without knowing customer and
it will not display anywhere in SO, Quotation but we will include it in price; user should have that option
where to add that. PDF are given to you only for format not the pricing. Pricing will be as per given excel and
this rule for transportation, so take all pricing from excel only, not from PDF. Also some client ask for
optional items so there should be option for optional items to add in kit. Also some client remove some items
from kit to reduce price, that option should be feasible."

| Change | Status | Notes |
|---|---|---|
| **Transport (hidden)** box on every quotation line, per kit: added into the price the school sees; never printed on the quotation, PO template, sales order, proforma, invoice or receipt | ✅ | The salesperson chooses the line(s); the editor shows "School sees ₹…"; stored separately for our reference |
| The Excel's fixed **"Freight Transport" ₹100** taken out of the Focus and Plus kits: **Focus ₹2,854**, **Plus ₹3,144** (MRP unchanged) | ✅ | Migration `20261011090000_kit_options` |
| **Prices only from the Excel:** the class kits' prices that came from the sample PO (Play Group ₹2,360, Nursery ₹2,760, LKG ₹2,975, UKG ₹3,175) cleared | ✅ | They show "Not set" until the client gives prices ⏳ |
| **Change kit items** on a quotation: untick items to take them out, add optional items; MRP and price move by those items' prices; the line text says what changed (e.g. "Nursery Focus Kit (without Shape Kit; with Bag)") and the kit checklist sent with the PO follows it | ✅ | Needs item prices in the kit (Nursery kits have them; Settings → Products: "Item | school price | MRP") |

## R30. To-do opens on the calendar; double-click a date to add (3 Oct)

"In To-Do default view should be Calendar not list. Also if we double click date we should able to add own
to-do in calendar."

| Change | Status | Notes |
|---|---|---|
| To-do opens on the **Calendar** (month); **List** is one tap away (`/tasks?view=list`) | ✅ | |
| **Double-click a day** (month) or a day header / hour (week) to open "New to-do" with that date (and hour) filled in | ✅ | Double-clicking an existing item opens that item instead |
| Phones (no double-click): each day's list under the calendar has a **+ Add** button | ✅ | |

## R31. Choose the financial year after login (3 Oct)

"As this CRM will be used every year, at start there should be option to select Financial year (Apr-Mar). After
year completed there will be renewals of some clients and some client will not continue with. Also option to
select all financial year, specific year. If client not continued with us next year still his data won't be lost,
it will be there in our record so next year we can contact him. After login there should be screen to select
financial year first, like Apr26-Mar27 (it will display as 2026-27)."

| Change | Status | Notes |
|---|---|---|
| After login, a **Choose financial year** screen: each year as **2026-27** (Apr 2026 – Mar 2027), newest first, plus **All years** | ✅ | `/year`; next year appears from February; remembered on the device |
| The chosen year shows in the top bar (**FY 2026-27**, on phones **26-27**); tap it to change any time | ✅ | |
| Leads, opportunities, pipeline, outstanding, ledger, dashboard and their PDF/Excel follow the chosen year | ✅ | Items still open carry into the next year (see Business rules) |
| **Clients are never removed by year.** Clients list shows **In 2026-27: Renewed / New / Ordered again / Not renewed / No order**, with the year's order value, and filter chips for each | ✅ | Schools that didn't continue stay listed with "last ordered 2025-26", so they can be contacted again |
| A school's own page always shows its full history, whatever year is chosen | ✅ | |

## R32. Renewals follow the financial year (3 Oct)

"Follow the financial year (April – March)." (answer to the question in R31) ✅
Renewal opportunities are now for the **next financial year** (e.g. **FY 2027-28** while in 2026-27), valued at the
client's orders in the current financial year (or their latest order), to close by 31 March. Existing renewals
labelled 2027-28 already match. Screens say "FY" instead of "AY". (The client's PO form keeps its own "Academic
Year" heading.)

## R33. PO "Refer checklist", full check as owner and salesperson, workflow guide (4 Oct)

"In PO template if material excluded then written refer checklist but where is checklist. How we are school know
what is excluded. Now check everything as business owner and sales person view … also give me one document of
workflow for client (if needed add workflow tab for now, we will remove it later) but client should understand
every button and workflow, dependencies and everything."

| Change | Status | Notes |
|---|---|---|
| PO template **Material Exclude** now lists the items taken out of each kit ("Nursery Focus Kit: Shape Kit"), or "Nothing excluded" | ✅ | From the quotation's "Change kit items" |
| The **kit checklist is attached to the PO PDF from page 2** (removed items left out, added items under "Added for this school") | ✅ | WhatsApp message says so; separate checklist link kept |
| Full walk-through in the browser as a salesperson (lead → call → quotation with kit changes and transport → opportunity → PO template → Won → client → signed PO → sales order → invoice → part payment → receipt → dispatch → To-do) and as the owner (every page, every PDF/Excel export, year filters, access rules, phone width) | ✅ | Fixes below |
| Fix: a lead that was **already sent a quotation converts at Proposal Sent** (55%) with a "Follow up on the quotation" call, not Interested / "Schedule demo" | ✅ | |
| Fix: **deal value fills in from the PO template** (kits × rate) when nobody typed one, so the pipeline and dashboard aren't ₹0 | ✅ | A typed value is never overwritten |
| Fix: client page header squeezed the school name on laptop screens | ✅ | |
| Fix: "sent by downloaded" → "sent by download" | ✅ | |
| **Workflow guide** for the client: `docs/WORKFLOW.md`, also a **How it works** menu item for everyone (with Print / save as PDF) and a tab in Settings → Project documents | ✅ | Switch off in Settings → Features → "How it works guide" when no longer needed |

## R34. Only Hot and Warm when a lead becomes an opportunity (4 Oct)

"After client converted to opportunity at start there should only 2 category Hot and Warm, remove Cold." ✅
Convert to opportunity, the "convert" tick on Log interaction, saving a lead as Qualified and the lead Excel
template / upload now offer only **Hot** and **Warm**. **Cold** is still available later in the opportunity window
(a deal can cool down), and in the category filter, so existing Cold deals stay visible.

## R35. Edit wrong details; one change shows everywhere (4 Oct)

"We should be able to change lead details or edit it cause there is always chances of wrong data entry. Change at
one place should reflect everywhere." ✅

| Change | Status | Notes |
|---|---|---|
| **Edit school details** on a converted or disqualified lead (before: read-only after conversion) | ✅ | Active leads are edited on the page as before |
| **Edit school details** in the opportunity window (school name, contact, designation, mobile, email, state, city, area, address, curriculum, strength, branches) | ✅ | For renewal deals it corrects the client |
| One correction (lead, opportunity or client **Edit details**) updates the lead, its opportunities, the client and draft quotations | ✅ | Sent quotations keep what the school received; orders, invoices and receipts read the client's current details |
| Timeline note "School details corrected: mobile, …" | ✅ | |

## R36. Accounts section: payments approved before receipts (4 Oct)

"Now create one account section; currently it will be under admin account, later we will decide owner of account
section. In account, once payment recorded by user it will go for approval to accounts; once it is approved it will
reflect in system and then only user or account can send payment receipt to school owner."

| Change | Status | Notes |
|---|---|---|
| **Accounts → Payment approvals** page (Director / Admin login for now), menu count badge, bell alert | ✅ | Owner of Accounts to be decided ⏳ (a separate role can be added) |
| Payments and advances recorded by the team wait as **Awaiting approval**: not counted (client strip, Outstanding, Ledger, Dashboard, targets), no receipt; can't be recorded twice | ✅ | |
| **Approve**: counts as received, gets the receipt number (so rejected entries leave no gaps), receipt window opens; recorder gets a "Send receipt" to-do | ✅ | Receipt can be sent by the user or Accounts only after approval |
| **Reject** with a reason: never counts; recorder gets a to-do with the reason and may delete the entry | ✅ | |
| Dashboard Finance tile "Waiting for Accounts", PDF/Excel of the approvals page, switch in Settings → Features | ✅ | Payments recorded by Accounts count at once; existing payments stay approved |

## R37. Expenses, reimbursements and advances (4 Oct)

"Our sales team visits multiple cities so they have to spend money on hotel, travel, meal etc. Also some money is
spent from the company's accounts for services, licenses etc. Currently they take bill photos and upload them in the
company WhatsApp group and one person maintains the record and reimburses money at month end or in the meantime.
Also the company gives some money in advance to employees for such spends … now we want this to happen in this CRM
so every money gets counted."

| Change | Status | Notes |
|---|---|---|
| **My expenses** for everyone: add a spend with the **bill photo** (camera on phones, shrunk automatically; or PDF), kind, amount, city, what for, school; paid from **own money** or **advance** | ✅ | Menu → My expenses |
| **Accounts → Expenses**: approve / reject (reason → to-do), view bills | ✅ | Director / Admin for now (R36 owner decision pending) |
| **Pay back** a person's approved own-money spends (date, reference) | ✅ | |
| **Advances** to employees (given / returned); balance = given − returned − spent from advance | ✅ | Shown to the employee too |
| **Company-account expenses** (services, licences…) entered by Accounts | ✅ | |
| PDF / Excel, dashboard Finance tile "Expenses", bell alert, menu badge, financial-year filter, feature switch | ✅ | |
