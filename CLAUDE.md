# Wonder Learning CRM: notes for Claude

**Start here, every session:** read `docs/STATUS.md` (where things stand, what we're waiting for) and
`docs/REQUIREMENTS.md` (every client request R1…, with status). `docs/BUSINESS_RULES.md` explains how the CRM
behaves; `docs/DOWNLOADS_AND_TEMPLATES.md` lists every download/upload/template; `docs/WORKFLOW.md` is the client's
how-it-works guide (keep it in step with screens and buttons). README.md has setup,
roles and the code map. You should not need old chat history.

## Keeping the documents current (owner's standing request, R25)

- With **every push**, in the same commit: add an entry to `docs/CHANGELOG.md`; update the request's status
  in `docs/REQUIREMENTS.md` (add new requests at the bottom as R26, R27…, in the owner's words); update
  `docs/STATUS.md` if anything waited-on or pending changed; update `docs/BUSINESS_RULES.md` if a rule changed.
- **Downloads, uploads and templates must always match the current app.** When a field, label, list or rule
  changes, run the checklist at the bottom of `docs/DOWNLOADS_AND_TEMPLATES.md` (lead form, Excel template +
  upload rules + tests, report exports, PDFs, message texts) and fix them in the same commit.
- Never put passwords, database URLs or other secrets in code or docs (some were shared in chat; they live
  only in Vercel's environment variables).

## Working rules

- **Every screen must work well on both web and mobile.** From Phase 2 on, design and check each new
  screen at desktop width *and* phone width (about 390px) before calling it done: no sideways page
  scrolling, tap-friendly controls, and the key information visible without swiping tables.
  Prefer card lists over wide tables on phones.
- The owner is not a developer: explain changes and steps in plain language.
- Allowed-value lists have exactly one source: fixed lists in `src/lib/constants.ts`, states/cities in the
  database via `src/server/locations.ts`. The lead form, the Excel template and the upload parser must all read
  those; never hardcode a second copy.
- Visibility rules live only in `src/server/access.ts` / `src/lib/permissions.ts`.
- The Android app (`android/`) points at the live address in `Config.java`. If the domain changes, rebuild it (see `android/README.md`).
- Every report-like screen has PDF + Excel export (`ExportButtons` + a builder in `src/server/reports/index.ts`); add one for new reports.
- Opportunity "Category" (Hot/Warm/Cold, stored as `temperature`) belongs to the opportunity, not the lead.
- Optional features are switchable in Settings → Features (`src/lib/features.ts`); new optional features should get a switch so the client can turn them off.
- Money corrections (cancel invoice, delete payment, credit notes, clear/bounce cheques) are for `canManageFinance` roles only.
- Deploys: pushing to the `claude/kind-pasteur-jpzqm5` branch auto-deploys to Vercel (see DEPLOY.md).

- No fictional sample data in seeds. No pull requests unless the owner asks. Only push to `claude/kind-pasteur-jpzqm5`.
- The look follows the client's prototype (top bar search/Add/bell, coloured strips, cards, tabs); keep new
  screens consistent with it. On phones, pop-ups are bottom sheets and the page itself scrolls.
- Dashboard sections (Sales, Finance, Team & management, Service & delivery) are listed in
  `src/lib/dashboard-sections.ts`; new dashboard content goes in one of them, and in the dashboard export too.
