import { db } from "@/lib/db";
import { toDbDate, todayIST } from "@/lib/dates";
import { ROLE_LABEL } from "@/lib/constants";
import { canManageProducts, canManageSettings, canViewUsers } from "@/lib/permissions";
import { ToastProvider } from "@/components/client";
import { requireUser } from "@/server/session";
import { Shell, type NavGroup } from "./shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const due = await db.task.count({
    where: { assigneeId: user.id, status: "OPEN", dueDate: { lte: toDbDate(todayIST()) } },
  });

  const nav: NavGroup[] = [
    { group: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "grid" }] },
    {
      group: "Sales",
      items: [
        { href: "/leads", label: "Leads", icon: "user" },
        { href: "/opportunities", label: "Opportunities", icon: "briefcase" },
        { href: "/pipeline", label: "Pipeline", icon: "funnel" },
        { href: "/tasks", label: "To-do", icon: "check", badge: due },
        { href: "/clients", label: "Clients", icon: "school" },
        { href: "/outstanding", label: "Outstanding", icon: "rupee" },
      ],
    },
  ];
  const admin = [
    ...(canViewUsers(user.role) ? [{ href: "/admin/users", label: "Users", icon: "users" as const }] : []),
    ...(canManageProducts(user.role) ? [{ href: "/admin/products", label: "Products", icon: "box" as const }] : []),
    ...(canManageSettings(user.role) ? [{ href: "/admin/locations", label: "Locations", icon: "pin" as const }] : []),
    ...(canManageSettings(user.role) ? [{ href: "/admin/quotation", label: "Quotation", icon: "doc" as const }] : []),
  ];
  if (admin.length) nav.push({ group: "Settings", items: admin });

  return (
    <ToastProvider>
      <Shell nav={nav} user={{ id: user.id, name: user.name, role: ROLE_LABEL[user.role] }}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
