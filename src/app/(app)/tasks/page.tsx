import { seesAllSales } from "@/lib/permissions";
import { todayIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/server/session";
import { taskAssignees, taskList, taskTargets } from "@/server/queries";
import { NewTaskButton, TaskBoard, TeamToggle } from "./tasks-client";

export const metadata = { title: "Follow-ups" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const user = await requireUser();
  const canTeam = seesAllSales(user.role);
  const team = canTeam && (await searchParams).team === "1";
  const [tasks, people, targets] = await Promise.all([taskList(user, team), taskAssignees(user), taskTargets(user)]);

  return (
    <>
      <PageHeader title="Follow-ups & tasks" sub="Every reminder in one list. Tasks marked Auto were created by the system.">
        {canTeam ? <TeamToggle on={team} /> : null}
        <NewTaskButton people={people} targets={targets} me={user.id} />
      </PageHeader>
      <TaskBoard open={tasks.open} done={tasks.done} today={todayIST()} showOwner={team} />
    </>
  );
}
