import { notFound } from "next/navigation";
import { canManageCompanyAccounts } from "@/lib/permissions";
import { listAccounts } from "@/server/company";
import { canApproveExpenses, expenseApprover } from "@/server/expenses";
import { getFeatures } from "@/server/features";
import { requireUser } from "@/server/session";

/** Company accounts screens (R39): Accounts roles only, and only while the feature is on. */
export async function companyPage() {
  const user = await requireUser();
  if (!canManageCompanyAccounts(user.role) || !(await getFeatures()).companyAccounts) notFound();
  const [accounts, canApprove, approver] = await Promise.all([listAccounts(), canApproveExpenses(user), expenseApprover()]);
  return { user, accounts, options: accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind, active: a.active })), canApprove, approver };
}
