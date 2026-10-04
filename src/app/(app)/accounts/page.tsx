import { notFound } from "next/navigation";
import { ExportButtons } from "@/components/export-buttons";
import { Kpi, PageHeader } from "@/components/ui";
import { inr } from "@/lib/format";
import { canApprovePayments } from "@/lib/permissions";
import { isEmailConfigured } from "@/server/mailer";
import { approvalQueue } from "@/server/finance/service";
import { getFeatures } from "@/server/features";
import { requireUser } from "@/server/session";
import { ApprovalLists } from "./approval-card";

export const metadata = { title: "Payment approvals" };

/**
 * Accounts (R36): payments recorded by the team wait here. Approving makes them count as received and
 * gives the receipt number; only then can the receipt go to the school. Under the Admin login for now.
 */
export default async function AccountsPage() {
  const user = await requireUser();
  if (!canApprovePayments(user.role)) notFound();
  const [{ waiting, decided }, features] = await Promise.all([approvalQueue(user), getFeatures()]);
  const total = waiting.reduce((t, p) => t + p.amount, 0);
  const emailReady = isEmailConfigured();
  return (
    <>
      <PageHeader
        title="Payment approvals"
        sub="Payments recorded by the team wait here. Check the money is in the bank (or the cheque is in hand), then approve: it counts as received and the receipt can be sent to the school."
      >
        <ExportButtons report="approvals" />
      </PageHeader>
      {!features.paymentApproval ? (
        <div className="note mb-3">
          Payment approval is switched off in Settings → Features, so new payments count straight away. Anything listed below was recorded while it
          was on.
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 min-[901px]:grid-cols-4">
        <Kpi label="Waiting for approval" value={String(waiting.length)} sub={inr(total)} color="#E8930C" />
        <Kpi label="Approved (30 days)" value={String(decided.filter((d) => d.approval === "APPROVED").length)} sub={inr(decided.filter((d) => d.approval === "APPROVED").reduce((t, p) => t + p.amount, 0))} color="#0E8F79" />
        <Kpi label="Rejected (30 days)" value={String(decided.filter((d) => d.approval === "REJECTED").length)} sub="Recorder told why" color="#D9412D" />
      </div>
      <ApprovalLists waiting={waiting} decided={decided} emailReady={emailReady} me={{ name: user.name }} />
    </>
  );
}
