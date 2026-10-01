import { notFound } from "next/navigation";
import { seesAllSales } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { getFeatures } from "@/server/features";
import { requireUser } from "@/server/session";
import { targetProgress, thisMonth } from "@/server/targets";
import { TargetsForm } from "./form";

export const metadata = { title: "Targets" };

export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  if (!seesAllSales(user.role) || !(await getFeatures()).targets) notFound();
  const month = (await searchParams).month ?? thisMonth();
  const p = await targetProgress(user, month);
  return (
    <>
      <PageHeader
        title="Targets"
        sub="Monthly targets per salesperson. Sales = invoices raised for their clients; collection = money received (cleared)."
      />
      <TargetsForm key={p.month} month={p.month} rows={p.rows} />
    </>
  );
}
