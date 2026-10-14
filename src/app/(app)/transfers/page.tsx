import { notFound } from "next/navigation";
import { ExportButtons } from "@/components/export-buttons";
import { Card, Empty, PageHeader } from "@/components/ui";
import { canApproveTransfers } from "@/lib/permissions";
import { getFeatures } from "@/server/features";
import { requireUser } from "@/server/session";
import { transferList } from "@/server/transfers";
import { TransferCard } from "./transfer-card";

export const metadata = { title: "Transfers" };

/** R43: lead / client transfers. Sales Head, Admin and Director approve; others see their own requests. */
export default async function TransfersPage() {
  const user = await requireUser();
  if (!(await getFeatures()).transfers) notFound();
  const approver = canApproveTransfers(user.role);
  const { waiting, decided } = await transferList(user);
  return (
    <>
      <PageHeader
        title="Transfers"
        sub={
          approver
            ? "Requests to move a lead or client to another salesperson. Approve to move it (with its open deal and to-dos), or reject with a reason."
            : "Your requests to move a lead or client to another salesperson. The Sales Head or Admin approves them."
        }
      >
        <ExportButtons report="transfers" />
      </PageHeader>
      <Card title={`Waiting for approval (${waiting.length})`}>
        {waiting.length ? (
          <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">
            {waiting.map((t) => (
              <TransferCard key={t.id} t={t} approver={approver} />
            ))}
          </div>
        ) : (
          <Empty>Nothing waiting.</Empty>
        )}
      </Card>
      <div className="mt-4">
        <Card title="Decided in the last 30 days">
          {decided.length ? (
            <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">
              {decided.map((t) => (
                <TransferCard key={t.id} t={t} approver={false} />
              ))}
            </div>
          ) : (
            <Empty>No decisions yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
