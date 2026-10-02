# Wonder Learning CRM

Sales CRM for Wonder Learning India: users & roles, leads (with Excel upload), opportunities
(list + pipeline board), quotations, clients, purchase orders, sales orders, dispatch, invoices,
payments & receipts, outstanding, ledger, To-do, dashboard with sections, PDF/Excel exports and an
Android app.

Flow: Lead → Opportunity (Category Hot/Warm/Cold) → Quotation → Won → Client → PO → Sales order →
Dispatch → Invoice → Payments.

**Project documents (requirements, rules, status, change log, templates): see [`docs/`](docs/README.md).**

Next.js 16 (App Router) · TypeScript · PostgreSQL + Prisma 7 · Auth.js (email/password) · Tailwind 4.

## Local setup

```bash
cp .env.example .env    # set AUTH_SECRET (npx auth secret) and the SEED_PASSWORD_* values
npm install             # also generates the Prisma client
npm run db:up           # Postgres 16 via docker compose
npx prisma migrate dev  # create tables
npm run db:seed         # 7 products (no prices yet) + the initial team
npm run dev             # http://localhost:3000
```

The seed creates the team listed in `prisma/seed-users.ts` with their initial
password from `.env`, and the product catalogue without prices. It creates no
sample leads or opportunities, and re-running it never overwrites existing rows.

## Roles

| Role | Sees | Also |
|---|---|---|
| Director | All sales data | Manages users (incl. Directors), products, states/cities, settings, money corrections |
| Admin | All sales data | Manages users, products, states/cities, settings, money corrections |
| Sales Head | All sales data | Manages products and prices, targets, money corrections; can assign work to anyone in sales |
| Sales Manager | **Only their own** leads, opportunities and tasks | Can only assign work to themselves |
| Sales Executive | **Only their own** leads, opportunities and tasks | Can only assign work to themselves |

Visibility rules live in one place, `src/server/access.ts`; every query and
action goes through it.

## Code map

- `prisma/schema.prisma` — data model. Master lists (sources, designations, publications,
  follow-up types, competitors, lost reasons, states) are text columns validated against
  `src/lib/constants.ts`, so editing a list needs no migration.
- `src/server/` — business rules (`leads.ts`, `opportunities.ts`, `clients.ts`, `tasks.ts`,
  `activities.ts`, `settings.ts`), validation (`validation.ts`), read models (`queries.ts`, `dashboard.ts`).
- `src/app/actions.ts` — server actions: authenticate, call a service, revalidate.
- `src/app/(app)/` — screens: dashboard (sections in `src/lib/dashboard-sections.ts`), leads, opportunities, pipeline, To-do, clients, outstanding, ledger, settings. `top-bar.tsx` is the search / "+ Add" / alerts bell (`src/server/search.ts`).
- `src/server/locations.ts` — states and cities (managed in Settings → Locations); the only list behind the form, the Excel template and the upload.
- `src/server/lead-excel/` — bulk lead upload: `columns.ts` (the template's columns, built from `src/lib/constants.ts`), `template.ts` (generated on each download), `import.ts` (re-checks every row, then uses `createLead`).
- `src/server/quotation/` — quotations: `service.ts` (drafts, numbering QUO/YYYY/MM/NNN, send/revise, email), `pdf.tsx` (3-page PDF in the Wonder Learning format), `content.ts` (standard text, edited in Settings → Quotation). `src/server/mailer.ts` sends email once SMTP_* is set (see DEPLOY.md).
- `src/server/finance/` — after-sale money for clients: `service.ts` (sales orders SO/…, invoices INV/…, instalment payments with receipts RCPT/… (PDF, link `/r/<token>`), collection follow-ups, reminders, share link `/i/<token>`), `money.ts` (totals, GST per line, Unpaid / Partially paid / Paid / Overdue rules), `invoice-pdf.tsx` (provisional layout until the business's invoice sample is matched). Screens: client page sections and `/outstanding`.
- `src/server/finance/po.ts`, `po-pdf.tsx`: purchase orders, i.e. the PO template made from a sent quotation, PO number/date on sales orders and the uploaded signed PO (stored in the database, 4 MB max).
- `src/server/finance/ledger.ts`: the client ledger, built from invoices (debit) and payments (credit), by financial year (April–March) or custom dates, for one client or all.
- `src/lib/features.ts` + `src/server/features.ts`: optional features switched on/off in Settings → Features (advance & proforma, cheques, credit notes, dispatch, renewals, ageing, targets, contacts, documents, quotation validity). Client components read them with `useApp()` (`src/components/app-context.tsx`).
- `src/server/finance/dispatch.ts` (+ `challan-pdf.tsx`): dispatch in lots with delivery challans DC/…; `src/server/files.ts`: client documents and proof of delivery; `src/server/contacts.ts`: extra contacts; `src/server/renewals.ts`: academic-year renewals; `src/server/targets.ts`: monthly targets; `src/server/password.ts`: login lock and forgot password.
- Money rules: payments count as received only when `RECEIVED` or `CLEARED` (cheques in hand/deposited are "pending"); credit notes reduce an invoice's balance; advances (payments on a sales order) attach to its invoice when it's created.
- `src/server/reports/`: PDF and Excel exports. `index.ts` defines each screen's report with the same filters and access as the screen; `render.ts`/`pdf.tsx` draw them. Route: `/api/export/<report>?format=pdf|xlsx`.
- `android/`: the Android app (APK), which opens the live site and works online only. See `android/README.md`. The public `/download-app` page serves `public/downloads/wonder-crm.apk`.
- `src/components/date-input.tsx` — every date field; always DD/MM/YYYY regardless of browser language.

## Tests

```bash
npm test         # unit + integration tests against TEST_DATABASE_URL (a throwaway DB)
npm run lint
npm run typecheck
```

## Extending in later phases

- **Clients / onboarding / orders**: `Client` already exists (created by `convertToClient` in
  `src/server/clients.ts`), and `Task`/`Activity` link to it. Fuller onboarding, agreements and
  orders hang off `Client`.
- **Printed material**: `Product.type = MATERIAL`; `OpportunityItem` already carries qty and price.
- **More roles**: add to the `Role` enum and decide their visibility in `src/lib/permissions.ts`.
