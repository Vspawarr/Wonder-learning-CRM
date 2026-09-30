import { redirect } from "next/navigation";
import { Logo } from "@/components/icons";
import { currentUser } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <main className="min-h-full bg-bg px-6 pt-[calc(28px+env(safe-area-inset-top,0px))] pb-10">
      <div className="mx-auto mt-[8vh] max-w-[420px]">
        <div className="flex items-center gap-4">
          <Logo size={44} />
          <div>
            <h1>Wonder Learning</h1>
            <p className="muted mt-1">Sales &amp; leads · sign in to continue</p>
          </div>
        </div>
        <div className="card mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
