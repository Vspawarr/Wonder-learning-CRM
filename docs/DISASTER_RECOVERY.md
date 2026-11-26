# Disaster recovery: rebuilding the CRM if anything is lost

_Owner's request (R61, 26 Nov 2026): "Keep everything safe … in any case we lost project on Vercel or Neon or GitHub we
would able to make it faster again."_ Keep this page current whenever hosting, settings or secrets change.

## 1. What lives where

| Part | Where | What is lost if it goes | How it comes back |
|---|---|---|---|
| **Code** (website, Android app, documents, these notes) | GitHub: `github.com/Vspawarr/Wonder-learning-CRM`, branch `claude/kind-pasteur-jpzqm5` | Nothing, if a copy exists (habit 2 below) | Push the copy to a new GitHub repository (§4C) |
| **Website** (running the code) | Vercel project (region Singapore `sin1`, settings in `vercel.json`) | Only the address and the settings (§2) | Import the code again (§4A), about 15 minutes |
| **Data** (leads, clients, quotations, orders, invoices, payments, stock, users, uploaded files) | Neon Postgres (Singapore, Postgres 16) | **Everything since the last backup** | New Neon database + restore the latest backup (§4B) |
| **Secrets** (database address, app secret, first passwords, email password) | Only in Vercel → Settings → Environment Variables (never in code or chat) | Logins to Vercel / Neon, shared links | Kept in the owner's private note (habit 3) |
| **Android app** | Code in `android/`; signing key `android/release.keystore` (in the code); the built app `public/downloads/wonder-crm.apk` | Nothing (it is in the code) | Rebuild only if the address changes (`android/README.md`) |
| **Domain** (later, e.g. `crm.wonderlearning.in`) | DNS at the domain seller + Vercel → Settings → Domains | The address stops working | Add the domain to the new Vercel project, update DNS (DEPLOY.md step 5) |

Everything about the data (every table, every uploaded file) is in **one backup file** from **Settings → Backup**.

## 2. The settings to keep (names only; the values go in the owner's private note, never here)

| Name | What it is | If it is lost |
|---|---|---|
| `DATABASE_URL` | Neon connection string (pooling off) | Copy it again from Neon → Connect |
| `AUTH_SECRET` | The app's secret: logins and the private links sent to schools (quotations, POs, invoices, marketing files) | A new one works, but **links already sent to schools stop working** and everyone signs in again. Keep the same value if at all possible |
| `SEED_PASSWORD_GAUTAMI`, `_VIREN`, `_ROHAN`, `_VINAY`, `_HARSHAL` | First passwords, used only when a brand-new database is set up | Any new values; after a restore the users' own passwords come back from the backup |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (optional) | Email sending | Make a new Gmail App Password (DEPLOY.md "Optional") |

## 3. Habits that keep it safe

1. **Weekly data backup.** Admin: **Settings → Backup → Download full backup** every week and before any big change
   (an upload of old records, a price change, the domain move). Save it in Google Drive in a **private** folder, e.g.
   "Wonder learning / CRM backups". Keep the last 8; delete older ones. Never share the file: it has all client and
   money data and the team's (scrambled) passwords.
2. **Monthly code copy.** On GitHub open the repository → **Code → Download ZIP** (branch `claude/kind-pasteur-jpzqm5`)
   and save it next to the backups. (Or ask Claude to make a copy.)
3. **Private note of the settings (§2)**: the values from Vercel → Settings → Environment Variables, in a password
   manager or a private note only the owner can open. Update it when a value changes.
4. **Accounts:** Vercel, Neon and GitHub all sign in with the same GitHub account. Turn on two-step login for it and
   keep its recovery codes in the private note.
5. **Neon's own history** (first thing to try after a mistake, e.g. data deleted by accident): Neon → project →
   **Restore** (branch restore to a time). The free plan keeps only a short history (hours to a day); a paid plan keeps
   longer. The weekly backup covers anything older.

## 4. What to do

Ask Claude (a Claude Code session on this repository) to do the technical steps; give it the backup file and set
the secrets in Vercel / `.env` yourself. Each step also works by hand.

### A. Vercel project lost (data and code are fine): about 15 minutes

1. Vercel → **Add New → Project** → import the GitHub repository (DEPLOY.md step 3).
2. Add the environment variables from your private note (§2), the **same values**, especially `DATABASE_URL` and
   `AUTH_SECRET`.
3. Settings → Git → Production Branch = `claude/kind-pasteur-jpzqm5`. Deploy.
4. If the address changed (not `wonder-learning-crm.vercel.app`): re-add the domain (DEPLOY.md step 5) or rebuild the
   Android app for the new address (`android/README.md`).

### B. Neon database lost or damaged: about 30 minutes + restore

1. Try Neon's own restore first (habit 5). If the project itself is gone, continue.
2. Neon: new project, **Postgres 16 or newer, region AWS Asia Pacific (Singapore)**; copy the connection string
   (pooling off). DEPLOY.md step 1.
3. Vercel → Settings → Environment Variables → `DATABASE_URL` = the new string → **Redeploy**. The deploy creates all
   the tables and the starting users and lists by itself.
4. Restore the latest backup into the new database, from a computer with the code (Node 20+):
   ```
   # .env holds DATABASE_URL=<the new Neon string>
   npm install
   npx prisma migrate deploy
   npx tsx --env-file=.env scripts/restore-backup.ts wonder-crm-backup-YYYY-MM-DD-HH-MM.json.gz --wipe
   ```
   `--wipe` clears the starting users / lists the deploy made, then puts back every table from the backup (files
   included) and makes new numbers (L-…, C-…, invoices…) continue after the highest restored one. It refuses a file
   that isn't a CRM backup, and a database missing updates.
5. Check (§5). Data entered after the backup's date must be typed in again.

### C. GitHub repository lost: about 20 minutes

1. Take the latest code copy (habit 2), or any computer / Claude session that still has the code.
2. GitHub → **New repository** (private) → push the code to it, on branch `claude/kind-pasteur-jpzqm5`.
3. Vercel → project → Settings → Git → connect the new repository (or §A with the new repository).

### D. Everything lost

C (code) → B steps 2–4 (new database + restore) → A (website with the new `DATABASE_URL` and the old `AUTH_SECRET`
from the private note) → §5.

### E. The live database is reachable but the website is down

Make a backup straight from the database (a computer with the code, `.env` with the live `DATABASE_URL`):
`npx tsx --env-file=.env scripts/backup.ts` (writes the same file as Settings → Backup).

## 5. After any recovery: check

- [ ] Log in as Admin; Settings → Backup shows the same numbers of leads / clients / invoices / payments as the backup.
- [ ] Open a client with documents and a quotation PDF; open a marketing file.
- [ ] A link sent to a school earlier (quotation / PO) still opens (only if `AUTH_SECRET` is the same).
- [ ] Add a test lead: its number continues after the last one; delete it.
- [ ] The Android app opens the CRM (its address is in `android/src/in/wonderlearning/crm/Config.java`).
- [ ] Download a fresh backup straight away.

## 6. How the backup works (for developers)

- `src/server/backup.ts`: `backupStream` reads every table in the database (no list to maintain: new tables are
  included automatically) as Postgres JSON, 200 rows at a time, gzipped and streamed (no size limit);
  `restoreBackup` writes them back with `json_populate_recordset` (exact types: dates, enums, files), parents first
  from the foreign keys, filling in links between tables that point at each other afterwards, then moves every
  auto-number past the highest value. Tested in `tests/r61.test.ts` (back up → wipe → restore → every table identical).
- `GET /api/admin/backup` (Admin / Director) → page `src/app/(app)/admin/backup/page.tsx`.
- `scripts/backup.ts` (command-line backup), `scripts/restore-backup.ts` (restore).
- Rehearsed on 26 Nov 2026: backup downloaded from the page, restored into a brand-new database, all 47 tables
  identical, the CRM ran on it.
