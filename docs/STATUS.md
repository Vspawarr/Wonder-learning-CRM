# Current status

_Last updated: 3 Oct 2026. Update this page whenever the situation changes._

## Where things stand

- **Live:** wonder-learning-crm.vercel.app (free Vercel + Neon in Singapore). Every push to branch
  `claude/kind-pasteur-jpzqm5` goes live in 2–3 minutes. No pull requests are used.
- **Phase:** Phase 1 (Sales & Leads) plus most of the after-sale work (clients, quotations, PO, orders,
  invoices, payments, receipts, ledger, dispatch, renewals, targets) is built. Print press and services
  (training/audits) are not started.
- **Client testing:** test data was cleared on 1 Oct. Logins, products, states/cities, the quotation
  template and the feature switches were kept. Wonder Learning's team is testing with their own data and
  will send final inputs. **Next step: collect their feedback and add each item to `REQUIREMENTS.md`.**
- **Android app:** version 1.2 (versionCode 3), points at the Vercel address.

## Waiting on the client / owner

| Item | Why it matters | Ref |
|---|---|---|
| Feedback from the client's testing | Final changes before go-live | — |
| Prices (and item prices) for Play Group, Nursery (checklist kit), LKG and UKG kits: now unpriced, as prices come only from the Excel; answers to the open points in `docs/PRICING.md` | Settings → Products | R28, R29 |
| Current receipt-book and PO numbers to continue from | Settings → Documents → Numbering | R27 |
| Whether receipts should carry a scanned signature image (now: name only) | Printing someone's signature automatically needs their OK | R27 |
| Invoice sample | Invoice PDF layout is provisional; add GSTIN, HSN/SAC, place of supply, bank details | R12, R19 C |
| Preferred number formats for quotation, sales order, invoice (receipt and PO now follow the client's books) | "Ranges in sync" | R16.8 |
| Custom quotation samples / other templates | Match their exact formats | R16.7 |
| Email account details (SMTP) | Turns on email for quotations, invoices, receipts, reminders and "Forgot password" | R19 A6, `DEPLOY.md` |
| Hosting plan decision (Vercel Pro, Neon with longer backups) | Free plans aren't meant for business use or real money data | R19 A8 |
| Moving to the client's domain: keep Vercel + add domain, or own server | After the ~15-day trial | R13 |
| Opening balances for the ledger, and their format | Not loaded yet | R16 |
| Point 5 of the lead feedback (it came through empty) | Unknown request | R20 |

## Known limits / not done

- Invoice PDF layout is provisional (see above).
- Email is off on the live site until SMTP is set up; WhatsApp and Download work.
- Optional "manager approval for low prices" was not built (not requested).
- Later ideas not started: morning summary, automatic lead capture (website/Facebook/IndiaMART), WhatsApp
  Business API, "untouched 15+ days" list, change history, Accounts role.

## Working on the code (developers / Claude)

- Start with `CLAUDE.md`, then this folder. You should not need old chat history.
- Local: see `README.md` (Postgres via docker compose, `npm run dev`). Tests: `npm test` (integration tests
  against `TEST_DATABASE_URL`, 134 passing on 3 Oct), `npm run lint`, `npm run typecheck`.
- Database changes: add a migration in `prisma/migrations/` (Vercel runs `prisma migrate deploy` on each deploy).
- Before every push: tests, lint, typecheck, a build, a look at desktop and phone width, the downloads
  checklist in `DOWNLOADS_AND_TEMPLATES.md`, then update `CHANGELOG.md`, `REQUIREMENTS.md` and this page.
