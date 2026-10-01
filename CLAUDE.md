# Wonder Learning CRM: notes for Claude

See README.md for setup, roles and the code map.

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
- Deploys: pushing to the `claude/kind-pasteur-jpzqm5` branch auto-deploys to Vercel (see DEPLOY.md).

## Mobile backlog for Phase 1

The owner chose to finish the web version first, then do these together:

1. ~~Leads list: switch to a card list on phones (school, contact, status, temperature, next follow-up).~~ Done.
2. Pipeline: narrower columns on phones, plus a hint to use the Stage dropdown instead of dragging.
3. ~~Dashboard: show KPI tiles two per row on phones.~~ Done (`.kgrid-2`).
4. Remove the duplicated page title on phones (top bar and page heading both show it).
5. Lead page: the "Added … by …" line overflows slightly at 390px; let it wrap.
