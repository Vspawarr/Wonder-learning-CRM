# Project documents

Everything about this CRM's development, so nobody (person or Claude) has to read old chats.

| File | What's in it | Update when… |
|---|---|---|
| [STATUS.md](STATUS.md) | Where things stand, what we're waiting for, known limits | anything changes |
| [REQUIREMENTS.md](REQUIREMENTS.md) | Every client request in order (R1, R2…), with status and where it's built | a new request comes in, or one is finished |
| [BUSINESS_RULES.md](BUSINESS_RULES.md) | How the CRM behaves: roles, lead → client flow, money rules, numbering, features | a rule changes |
| [DOWNLOADS_AND_TEMPLATES.md](DOWNLOADS_AND_TEMPLATES.md) | Every download, upload and template, with a checklist to keep them current | a field, label or list changes |
| [CHANGELOG.md](CHANGELOG.md) | Every push, in plain words, newest first | every push |

Also in the project root: `README.md` (setup and code map for developers), `DEPLOY.md` (putting it
online, email, own domain), `CLAUDE.md` (working rules), `android/README.md` (the app).

**Never write passwords, database addresses or other secrets in these files.** They belong in Vercel →
Settings → Environment Variables only.
