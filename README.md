# Wonder Learning CRM

Phase 1: Sales & Leads (users & roles, leads, opportunities, follow-up tasks).

## Local setup

```bash
cp .env.example .env          # then fill in AUTH_SECRET and the two ADMIN* accounts
npm install
npm run db:up                 # Postgres 16 via docker compose
npx prisma migrate dev        # create tables
npm run db:seed               # 7 products (no prices yet) + the two Director accounts
```

The seed creates no sample leads, opportunities or users. Directors create
Sales Managers and Sales Executives from inside the app.
