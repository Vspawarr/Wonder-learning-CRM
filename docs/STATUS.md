# Current status

_Last updated: 5 Oct 2026. Update this page whenever the situation changes._

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
| **Ask the owner, when we move to the main domain: the company's bank account names, the company card and the office cash, with their opening balances and the date** (owner: "I'll provide, ask me when we deploy on main domain"). Then add them in Accounts → Account books | Company accounts (built 5 Oct) need them for correct balances; until then entries show as "Not assigned" | R39 |
| **Create the Director's login** (Settings → Users → Add user, role Director). From then on **expense approvals go to the Director**, including Admin's own expenses, and so do supplier bills, salaries and other company payments (R39); until then Admin approves | Owner said: "expense approval should be to Director, keep in memory once we give credential to Director" | R38 |
| Who owns the **Accounts** section (payment approvals): today the Director / Admin logins; a separate Accounts login/role can be added | Decide the person and their access | R36 |
| Current receipt-book and PO numbers to continue from | Settings → Documents → Numbering | R27 |
| Whether receipts should carry a scanned signature image (now: name only) | Printing someone's signature automatically needs their OK | R27 |
| Invoice sample | Invoice PDF layout is provisional; add GSTIN, HSN/SAC, place of supply, bank details | R12, R19 C |
| Preferred number formats for quotation, sales order, invoice (receipt and PO now follow the client's books) | "Ranges in sync" | R16.8 |
| Custom quotation samples / other templates | Match their exact formats | R16.7 |
| Email account details (SMTP) | Turns on email for quotations, invoices, receipts, reminders and "Forgot password" | R19 A6, `DEPLOY.md` |
| Hosting plan decision (Vercel Pro, Neon with longer backups) | Free plans aren't meant for business use or real money data | R19 A8 |
| **Move to the client's domain (R42), starts after the client's testing is complete.** Agreed: GitHub stays with us; website (Vercel) and database (Neon) in the client's own accounts; current data copied after cleaning out our dummy data; Vercel connection set up as the client prefers (add us to their Vercel team, or a GitHub Action deploy). Owner will provide the domain. At the move also: bank accounts + opening balances, Director login, starting receipt / PO numbers, rebuild the Android app for the new address, redirect the old vercel.app address | Plan in REQUIREMENTS.md R42 | R13, R42 |
| Opening balances for the ledger, and their format | Not loaded yet | R16 |
| Point 5 of the lead feedback (it came through empty) | Unknown request | R20 |

## Known limits / not done

- The **How it works** menu page (workflow guide) is temporary: switch it off in Settings → Features when the
  team no longer needs it (R33).

- Invoice PDF layout is provisional (see above).
- Email is off on the live site until SMTP is set up; WhatsApp and Download work.
- Optional "manager approval for low prices" was not built (not requested).
- **AI features (R40)** are on hold by the owner's choice (they cost money per use); the ideas are listed in REQUIREMENTS.md R40.
- Later ideas not started: morning summary, automatic lead capture (website/Facebook/IndiaMART), WhatsApp
  Business API, "untouched 15+ days" list, change history, Accounts role.

## Working on the code (developers / Claude)

- Start with `CLAUDE.md`, then this folder. You should not need old chat history.
- Local: see `README.md` (Postgres via docker compose, `npm run dev`). Tests: `npm test` (integration tests
  against `TEST_DATABASE_URL`, 150 passing on 5 Oct), `npm run lint`, `npm run typecheck`.
- Database changes: add a migration in `prisma/migrations/` (Vercel runs `prisma migrate deploy` on each deploy).
- Before every push: tests, lint, typecheck, a build, a look at desktop and phone width, the downloads
  checklist in `DOWNLOADS_AND_TEMPLATES.md`, then update `CHANGELOG.md`, `REQUIREMENTS.md` and this page.
