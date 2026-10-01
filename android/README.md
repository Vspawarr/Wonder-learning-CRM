# Wonder CRM Android app

A small Android app that opens the live CRM website full-screen. It is strictly online:
pages are never cached, and with no internet it shows a "No internet" screen instead of the CRM.
PDFs and Excel files are saved to the phone's Downloads; WhatsApp, phone and email links open
their own apps.

- Where it points: `src/in/wonderlearning/crm/Config.java` (`BASE_URL`).
- Build: `./build.sh`, which writes `public/downloads/wonder-crm.apk`. The website's
  `/download-app` page serves that file. Commit and push it, and Vercel publishes it.
- `release.keystore` signs every version. **Keep it, and back it up.** A build signed with a
  different key won't install over the old app, so everyone would have to uninstall first.

## When the CRM moves to the client's domain

1. Set `BASE_URL` to the new address. During the switch, add the old address to `EXTRA_HOSTS`.
2. Raise `versionCode` (e.g. 2) and `versionName` in `AndroidManifest.xml`.
3. Run `./build.sh`, then commit and push.
4. Staff download the app again from the new site's "Download app" page and install it over
   the old one.
