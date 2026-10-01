import Link from "next/link";
import { Logo } from "@/components/icons";
import { InstallSteps } from "./steps";

export const metadata = { title: "Download the app" };

// Public page (no sign-in needed) with the Android app and install steps.
export default function DownloadAppPage() {
  return (
    <main className="min-h-full bg-bg px-4 pt-[calc(28px+env(safe-area-inset-top,0px))] pb-10">
      <div className="mx-auto mt-[4vh] max-w-[520px]">
        <div className="flex items-center gap-4">
          <Logo size={44} />
          <div>
            <h1>Wonder CRM app</h1>
            <p className="muted mt-1">For Android phones · works only with internet</p>
          </div>
        </div>
        <InstallSteps />
        <p className="small muted mt-4 text-center">
          <Link href="/login">← Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
