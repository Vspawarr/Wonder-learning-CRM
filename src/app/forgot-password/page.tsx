import Link from "next/link";
import { BrandLogo } from "@/components/icons";
import { ForgotForm } from "./form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-full bg-bg px-6 pt-[calc(28px+env(safe-area-inset-top,0px))] pb-10">
      <div className="mx-auto mt-[6vh] max-w-[420px]">
        <div className="flex flex-col items-center text-center">
          <BrandLogo width={200} priority />
          <h1 className="mt-3">Forgot password</h1>
          <p className="muted mt-1">We&apos;ll email you a link to choose a new one.</p>
        </div>
        <div className="card mt-6">
          <ForgotForm />
        </div>
        <p className="small mt-4 text-center">
          <Link href="/login">← Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
