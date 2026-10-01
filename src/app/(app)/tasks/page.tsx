import { seesAllSales } from "@/lib/permissions";
import { todayIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { invoiceRows } from "@/server/finance/service";
import { isEmailConfigured } from "@/server/mailer";
import { requireUser } from "@/server/session";
import { taskAssignees, taskList, taskTargets } from "@/server/queries";
import { NewTaskButton, TaskBoard, TeamToggle } from "./tasks-client";

export const metadata = { title: "Follow-ups" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const user = await requireUser();
  const canTeam = seesAllSales(user.role);
  const team = canTeam && (await searchParams).team === "1";
  const [tasks, people, targets] = await Promise.all([taskList(user, team), taskAssignees(user), taskTargets(user)]);
  // Payment follow-ups get one-click reminder buttons for their invoice.
  const invoiceIds = tasks.open.flatMap((t) => (t.invoiceId ? [t.invoiceId] : []));
  const invoices = invoiceIds.length ? await invoiceRows(user, { id: { in: invoiceIds } }) : [];

  return (
    <>
      <PageHeader title="Follow-ups & tasks" sub="Every reminder in one list. Tasks marked Auto were created by the system.">
        {canTeam ? <TeamToggle on={team} /> : null}
        <NewTaskButton people={people} targets={targets} me={user.id} />
      </PageHeader>
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
