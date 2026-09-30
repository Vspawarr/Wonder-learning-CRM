import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ROLE_LABEL } from "@/lib/constants";
import { canManageSettings, canViewUsers } from "@/lib/permissions";
import { AvatarName, PageHeader, Pill, Table } from "@/components/ui";
import { requireUser } from "@/server/session";
import { UserButton } from "./user-form";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requireUser();
  if (!canViewUsers(me.role)) notFound();
  const manage = canManageSettings(me.role);
  const users = await db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, mobile: true, role: true, active: true },
  });

  return (
    <>
      <PageHeader title="Users" sub={manage ? "Add the team and set their role. Deactivated users can't sign in; their records stay." : "The team and their roles."}>
        {manage ? <UserButton actorRole={me.role} /> : null}
      </PageHeader>
      <Table head={["Name", "Role", "Email", "Mobile", "Status", ...(manage ? [""] : [])]}>
        {users.map((u) => (
          <tr key={u.id}>
            <td>
              <AvatarName id={u.id} name={u.name} />
              {u.id === me.id ? <span className="small faint"> (you)</span> : null}
            </td>
            <td>{ROLE_LABEL[u.role]}</td>
            <td>{u.email}</td>
            <td>{u.mobile ?? <span className="faint">—</span>}</td>
            <td>
              <Pill>{u.active ? "Active" : "Inactive"}</Pill>
            </td>
            {manage ? (
              <td className="num">
                {me.role === "DIRECTOR" || u.role !== "DIRECTOR" ? <UserButton actorRole={me.role} user={u} isSelf={u.id === me.id} /> : null}
              </td>
            ) : null}
          </tr>
        ))}
      </Table>
    </>
  );
}
