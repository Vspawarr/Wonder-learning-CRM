# Putting the CRM online (free, for testing)

You need about 20 minutes and a web browser; no programming. We use two free services:

- **Neon** stores the data (the database).
- **Vercel** runs the website.

Both have free plans that are enough for testing with a small team. Later you can connect your own
domain (e.g. `crm.wonderlearning.in`) in Vercel. See step 5.

---

## Step 1: Create the database (Neon)

1. Go to **https://neon.tech** and click **Sign up**. Signing in with your GitHub account is easiest.
2. Create a project:
   - **Name:** `wonder-crm`
   - **Postgres version:** 16 or newer
   - **Region:** **AWS Asia Pacific (Singapore)**. This matters for speed.
3. On the project dashboard, click **Connect**. A connection string appears, starting with
   `postgresql://`. Turn **Connection pooling off**, then click **Copy**.
4. Paste it into a note for now. **Keep it private.** It is the key to your data.

## Step 2: Prepare the settings

Write these down in your note. You will paste them into Vercel in step 3.

| Name | What to put |
|---|---|
| `DATABASE_URL` | The connection string from step 1 |
| `AUTH_SECRET` | A long random string. Open https://generate-secret.vercel.app/32 and copy what it shows. |
| `SEED_PASSWORD_GAUTAMI` | First password for Gautami (at least 8 characters) |
| `SEED_PASSWORD_VIREN` | First password for Viren |
| `SEED_PASSWORD_ROHAN` | First password for Rohan |
| `SEED_PASSWORD_VINAY` | First password for Vinay |
| `SEED_PASSWORD_HARSHAL` | First password for Harshal |

The passwords are used only the first time each account is created. Share each one privately with
that person, and ask them to change it after they log in (key icon at the bottom of the menu).

## Step 3: Put the website online (Vercel)

1. Go to **https://vercel.com**, click **Sign up**, and choose **Continue with GitHub**.
2. Click **Add New… → Project**. Find the **Wonder-learning-CRM** repository and click **Import**.
   If you don't see it, click **Adjust GitHub App Permissions** and allow access to that repository.
3. On the next screen, leave everything as it is, but open **Environment Variables**. Add each row from
   step 2: the name goes in **Key** and the value in **Value**. There are 7 in total.
4. Click **Deploy** and wait 2–3 minutes. If Vercel creates the project but no deployment starts,
   open the project, go to **Deployments**, and use **Create Deployment** with the branch shown on the
   import screen. While it builds, it also creates the tables and the 5 user
   accounts in your database automatically.
5. When you see **Congratulations**, click the preview to open your CRM. The address will look like
   `wonder-learning-crm.vercel.app`.

## Step 4: First login

The seed creates these accounts, each with the first password you set in step 2:

| Name | Role | Email |
|---|---|---|
| Gautami Varma | Admin | admin@wonderlearning.in |
| Viren Dogra | Sales Head | virend@wonderlearning.in |
| Rohan Jayde | Sales Manager | rj@wonderlearning.in |
| Vinay Choure | Sales Manager | vinay.wonderlearning@gmail.com |
| Harshal Jadhav | Sales Manager | harshal.wonderlearning@gmail.com |


1. Log in as Gautami (`admin@wonderlearning.in`) with the password you set.
2. Go to **Settings → Products** and enter prices and GST.
3. Go to **Settings → Cities** and add the cities you work in.
4. Go to **Settings → Users** and add the Sales Executives.

Then share the address with your testers.

## Step 5 (later): Use your own domain

In Vercel, open the project, go to **Settings → Domains**, type your domain (e.g. `crm.wonderlearning.in`)
and click **Add**. Vercel shows one or two DNS records to add at the place you bought the domain
(GoDaddy, Hostinger, etc.). Once you add them, the domain usually works within an hour, with HTTPS
included.

---

## Optional: send quotations by email

The CRM can email quotations (with the PDF attached) from your own email account.
Until this is set up, the email option is switched off and quotations are shared
by Download or WhatsApp.

With Gmail or Google Workspace:

1. Turn on 2-Step Verification for the account that will send the emails.
2. Create an **App Password** (Google Account → Security → App passwords) and copy it.
3. In Vercel, open the project → **Settings → Environment Variables** and add:

| Name | What to put |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | the sending email address |
| `SMTP_PASS` | the App Password from step 2 |
| `MAIL_FROM` | e.g. `Wonder Learning <wonderlearningindia@gmail.com>` |

4. Go to **Deployments**, click **⋯** on the latest one and choose **Redeploy**.

Replies go to the person who prepared the quotation.

---

## Good to know

- **Updates go live automatically.** Every time new code is pushed to GitHub, Vercel rebuilds the site
  and applies any database changes itself.
- **Free-plan behaviour:** Neon's free database pauses when nobody uses it. The first page after a quiet
  period can take a few seconds; after that it's fast.
- **If a deploy fails:** in Vercel, open **Deployments**, click the failed one, and copy the red error
  lines. The usual cause is a missing or mistyped environment variable. Fix it under
  **Settings → Environment Variables**, then click **Redeploy**.
- **Adding a new person later:** use **Settings → Users** in the CRM. Don't add them in Vercel.
- **Before real client data:** Neon's free plan keeps only a short history for restoring data. For real
  use, consider Neon's paid plan (longer backup history) and Vercel Pro.
