"use client";

import { useUserAgent } from "@/components/app-download";
import { Icon } from "@/components/icons";

export function InstallSteps() {
  const ua = useUserAgent();
  const inApp = ua.includes("WonderCRMApp");
  const iphone = /iPhone|iPad|iPod/.test(ua);

  if (inApp)
    return (
      <div className="card mt-6">
        <p>You are already using the Wonder CRM app.</p>
      </div>
    );

  return (
    <>
      <div className="card mt-6">
        <a className="btn pri w-full justify-center py-3 text-[16px]" href="/downloads/wonder-crm.apk" download="wonder-crm.apk">
          <Icon name="download" size={18} /> Download for Android (APK)
        </a>
        {iphone ? (
          <div className="note warn mt-3">
            The app is for Android phones. On iPhone, open this website in Safari and tap Share → <b>Add to Home Screen</b>.
          </div>
        ) : null}
        <p className="small muted mt-3">
          The app opens the same CRM as this website, with the same login. It needs internet: nothing is saved on the phone, and without a
          connection it shows a &quot;No internet&quot; screen.
        </p>
      </div>

      <div className="card mt-4">
        <h2>How to install</h2>
        <ol className="ml-5 list-decimal space-y-2">
          <li>Open this page on your Android phone and tap <b>Download for Android</b>.</li>
          <li>When the download finishes, tap the file (or open it from Downloads).</li>
          <li>
            If the phone says it can&apos;t install apps from this source, tap <b>Settings</b>, turn on <b>Allow from this source</b>, then go back.
          </li>
          <li>
            Tap <b>Install</b>. If Play Protect asks, choose <b>Install anyway</b>: the app isn&apos;t on the Play Store, so Google doesn&apos;t know it yet.
          </li>
          <li>Open <b>Wonder CRM</b> and sign in with your usual email and password.</li>
        </ol>
        <p className="small muted mt-3">To update later, download again from this page and install over the old app. Your login stays.</p>
      </div>
    </>
  );
}
