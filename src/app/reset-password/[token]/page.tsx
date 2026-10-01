import { BrandLogo } from "@/components/icons";
import { ResetForm } from "./form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-full bg-bg px-6 pt-[calc(28px+env(safe-area-inset-top,0px))] pb-10">
      <div className="mx-auto mt-[6vh] max-w-[420px]">
        <div className="flex flex-col items-center text-center">
          <BrandLogo width={200} priority />
          <h1 className="mt-3">Choose a new password</h1>
        </div>
        <div className="card mt-6">
          <ResetForm token={token} />
        </div>
      </div>
    </main>
  );
}
