# Wonder Learning CRM

Phase 1: Sales & Leads — users & roles, leads, opportunities (pipeline),
follow-up tasks, and a sales dashboard.

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
| Director | All sales data | Manages users (incl. Directors), products, cities |
| Admin | All sales data | Manages users, products, cities |
| Sales Head | All sales data | Can assign work to anyone in sales |
| Sales Manager | All sales data | Can assign work to anyone in sales |
| Sales Executive | **Only their own** leads, opportunities and tasks | Can only assign work to themselves |

Visibility rules live in one place, `src/server/access.ts`; every query and
action goes through it.

## Code map

- `prisma/schema.prisma` — data model. Master lists (sources, designations, publications,
  follow-up types, competitors, lost reasons, states) are text columns validated against
  `src/lib/constants.ts`, so editing a list needs no migration.
- `src/server/` — business rules (`leads.ts`, `opportunities.ts`, `tasks.ts`, `activities.ts`,
  `settings.ts`), validation (`validation.ts`), read models (`queries.ts`, `dashboard.ts`).
- `src/app/actions.ts` — server actions: authenticate, call a service, revalidate.
- `src/app/(app)/` — screens: dashboard, leads, lead detail, pipeline, follow-ups, settings.

## Tests

```bash
npm test         # unit + integration tests against TEST_DATABASE_URL (a throwaway DB)
npm run lint
npm run typecheck
```

## Extending in later phases

- **Schools / orders**: add nullable `schoolId` to `Opportunity`, `Task` and `Activity`; hook
  School/Order creation into `moveOpportunity` where it marks `WON` (see the "Phase 2" comment there).
- **Printed material**: `Product.type = MATERIAL`; `OpportunityItem` already carries qty and price.
- **More roles**: add to the `Role` enum and decide their visibility in `src/lib/permissions.ts`.
