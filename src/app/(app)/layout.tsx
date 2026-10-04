import { db } from "@/lib/db";
import { toDbDate, todayIST } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/constants";
import { canApprovePayments, canManageFinance, canManageProducts, canManageSettings, canViewUsers, seesAllSales } from "@/lib/permissions";
import { AppProvider } from "@/components/app-context";
import { getFeatures } from "@/server/features";
import { ToastProvider } from "@/components/client";
import { requireUser } from "@/server/session";
import { Shell, type NavGroup } from "./shell";
import { selectedYear } from "@/server/year";
import { fyLabel } from "@/lib/fy";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [due, features, year, approvals] = await Promise.all([
    db.task.count({
      where: {
        assigneeId: user.id,
        status: "OPEN",
        dueDate: { lte: toDbDate(todayIST()) },
      },
    }),
    getFeatures(),
    selectedYear(),
    canApprovePayments(user.role) ? db.payment.count({ where: { approval: "PENDING" } }) : 0,
  ]);

  const nav: NavGroup[] = [
    {
      group: "Overview",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: "grid" },
        ...(features.guide ? [{ href: "/guide", label: "How it works", icon: "doc" as const }] : []),
      ],
    },
    {
      group: "Sales",
      items: [
        { href: "/leads", label: "Leads", icon: "user" },
        { href: "/opportunities", label: "Opportunities", icon: "briefcase" },
        { href: "/pipeline", label: "Pipeline", icon: "funnel" },
        { href: "/tasks", label: "To-do", icon: "check", badge: due },
        { href: "/clients", label: "Clients", icon: "school" },
        { href: "/outstanding", label: "Outstanding", icon: "rupee" },
        { href: "/ledger", label: "Ledger", icon: "doc" },
      ],
    },
  ];
  // Accounts (R36): under the Admin login for now; who owns it will be decided later.
  if (canApprovePayments(user.role))
    nav.push({ group: "Accounts", items: [{ href: "/accounts", label: "Payment approvals", icon: "rupee", badge: approvals }] });
  const admin = [
    ...(canViewUsers(user.role) ? [{ href: "/admin/users", label: "Users", icon: "users" as const }] : []),
    ...(canManageProducts(user.role) ? [{ href: "/admin/products", label: "Products", icon: "box" as const }] : []),
    ...(canManageSettings(user.role) ? [{ href: "/admin/locations", label: "Locations", icon: "pin" as const }] : []),
    ...(canManageSettings(user.role) ? [{ href: "/admin/quotation", label: "Documents", icon: "doc" as const }] : []),
    ...(seesAllSales(user.role) && features.targets ? [{ href: "/admin/targets", label: "Targets", icon: "rupee" as const }] : []),
    ...(canManageSettings(user.role) ? [{ href: "/admin/features", label: "Features", icon: "grid" as const }] : []),
    ...(canManageSettings(user.role) ? [{ href: "/admin/docs", label: "Project documents", icon: "doc" as const }] : []),
  ];
  if (admin.length) nav.push({ group: "Settings", items: admin });

  return (
    <AppProvider
      value={{
        userId: user.id,
        name: user.name,
        canFinance: canManageFinance(user.role),
        seesAll: seesAllSales(user.role),
        features,
      }}
    >
      <ToastProvider>
        <Shell nav={nav} user={{ id: user.id, name: user.name, role: ROLE_LABEL[user.role] }} year={year === null ? null : fyLabel(year)}>
          {children}
        </Shell>
      </ToastProvider>
    </AppProvider>
  );
}
