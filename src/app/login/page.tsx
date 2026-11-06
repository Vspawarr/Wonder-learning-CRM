import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/icons";
import { PuzzleArt } from "@/components/puzzle-art";
import { currentUser } from "@/server/session";
import { DownloadAppLink } from "@/components/app-download";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

// R52: brand look: a purple welcome panel with the logo's puzzle pieces beside the sign-in card (above it on phones).
export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <main className="grid min-h-full bg-bg min-[901px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="login-hero relative flex flex-col justify-center overflow-hidden px-6 pt-[calc(22px+env(safe-area-inset-top,0px))] pb-8 text-white min-[901px]:px-14 min-[901px]:py-12">
        <div className="rainbow absolute inset-x-0 top-0" />
        <PuzzleArt className="mx-auto w-[min(340px,88vw)] min-[901px]:w-[min(560px,94%)]" />
        <div className="mx-auto mt-4 max-w-[460px] text-center min-[901px]:mt-8">
          <h1 className="text-[24px] leading-tight text-white min-[901px]:text-[34px]">Empowering Child Education</h1>
          <p className="mt-2 text-[14.5px] text-[#eadcf5] max-[900px]:hidden">
            Leads, quotations, purchase orders, invoices and payments for every school, in one place.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 max-[900px]:hidden">
            {["Leads", "Quotations", "Orders", "Accounts"].map((t) => (
              <span key={t} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[13px] font-semibold">
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="flex flex-col justify-center px-6 pt-6 pb-10 min-[901px]:px-12">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="flex flex-col items-center text-center">
            <BrandLogo width={230} priority />
            <h2 className="mt-4 text-[22px]">Welcome back</h2>
            <p className="muted mt-1">Sign in to the Wonder Learning Sales CRM</p>
          </div>
          <div className="card mt-6">
            <LoginForm />
          </div>
          <div className="mt-4 flex justify-center">
            <DownloadAppLink />
          </div>
        </div>
      </section>
    </main>
  );
}
