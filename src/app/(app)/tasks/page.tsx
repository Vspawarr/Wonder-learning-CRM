import { ExportButtons } from "@/components/export-buttons";
import { seesAllSales } from "@/lib/permissions";
import { todayIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { invoiceRows } from "@/server/finance/service";
import { isEmailConfigured } from "@/server/mailer";
import { requireUser } from "@/server/session";
import { taskAssignees, taskList, taskTargets, type TaskKind } from "@/server/queries";
import { NewTaskButton, TaskBoard, TodoFilters } from "./tasks-client";

export const metadata = { title: "To-do" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ team?: string; kind?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canTeam = seesAllSales(user.role);
  const team = canTeam && sp.team === "1";
  const kind: TaskKind = sp.kind === "todos" || sp.kind === "followups" ? sp.kind : "all";
  const [tasks, people, targets] = await Promise.all([taskList(user, team, kind), taskAssignees(user), taskTargets(user)]);
  // Payment follow-ups get one-click reminder buttons for their invoice.
  const invoiceIds = tasks.open.flatMap((t) => (t.invoiceId ? [t.invoiceId] : []));
  const invoices = invoiceIds.length ? await invoiceRows(user, { id: { in: invoiceIds } }) : [];

  return (
    <>
      <PageHeader title="To-do" sub="School follow-ups and your own work in one list. Items marked Auto were scheduled by the system.">
        <ExportButtons report="todo" />
        <NewTaskButton people={people} targets={targets} me={user.id} />
      </PageHeader>
      <TodoFilters canTeam={canTeam} />
      <TaskBoard
        open={tasks.open}
        done={tasks.done}
        today={todayIST()}
        showOwner={team}
        invoices={Object.fromEntries(invoices.map((i) => [i.id, i]))}
        emailReady={isEmailConfigured()}
        me={{ name: user.name }}
      />
    </>
  );
}
