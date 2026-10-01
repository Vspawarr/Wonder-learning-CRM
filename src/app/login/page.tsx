import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/icons";
import { currentUser } from "@/server/session";
import { DownloadAppLink } from "@/components/app-download";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <main className="min-h-full bg-bg px-6 pt-[calc(28px+env(safe-area-inset-top,0px))] pb-10">
      <div className="mx-auto mt-[8vh] max-w-[420px]">
        <div className="flex flex-col items-center text-center">
          <BrandLogo width={260} priority />
          <h1 className="mt-3">Sales CRM</h1>
          <p className="muted mt-1">Sign in to continue</p>
        </div>
        <div className="card mt-6">
          <LoginForm />
        </div>
        <div className="mt-4 flex justify-center">
          <DownloadAppLink />
        </div>
      </div>
    </main>
  );
}
