import { DateRangeFilter } from "@/components/date-range";
import { ExportButtons } from "@/components/export-buttons";
import { seesAllSales } from "@/lib/permissions";
import { todayIST } from "@/lib/dates";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { invoiceRows } from "@/server/finance/service";
import { isEmailConfigured } from "@/server/mailer";
import { requireUser } from "@/server/session";
import { taskAssignees, taskList, taskTargets, type TaskKind } from "@/server/queries";
import { NewTaskButton, TaskBoard, TodoFilters } from "./tasks-client";
import { TaskCalendar } from "./calendar";
import { calendarRange } from "@/lib/calendar";
import { isDateStr } from "@/lib/dates";
import Link from "next/link";

export const metadata = { title: "To-do" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ team?: string; kind?: string; new?: string; from?: string; to?: string; view?: string; cal?: string; d?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const canTeam = seesAllSales(user.role);
  const team = canTeam && sp.team === "1";
  const kind: TaskKind = sp.kind === "todos" || sp.kind === "followups" ? sp.kind : "all";
  // Calendar (month / week) by default, or the list; the calendar loads the days it shows.
  const calendar = sp.view !== "list";
  const mode = sp.cal === "week" ? "week" : "month";
  const anchor = sp.d && isDateStr(sp.d) ? sp.d : todayIST();
  const range = calendar ? calendarRange(mode, anchor) : { from: sp.from, to: sp.to };
  const [tasks, people, targets] = await Promise.all([taskList(user, team, kind, range), taskAssignees(user), taskTargets(user)]);
  // Payment follow-ups get one-click reminder buttons for their invoice.
  const invoiceIds = tasks.open.flatMap((t) => (t.invoiceId ? [t.invoiceId] : []));
  const invoices = invoiceIds.length ? await invoiceRows(user, { id: { in: invoiceIds } }) : [];

  return (
    <>
      <PageHeader title="To-do" sub="School follow-ups and your own work. Double-click a day in the calendar to add a to-do. Items marked Auto were scheduled by the system.">
        <ExportButtons report="todo" />
        <NewTaskButton key={sp.new} autoOpen={!!sp.new} people={people} targets={targets} me={user.id} />
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <TodoFilters canTeam={canTeam} />
        <div className="chips" role="group" aria-label="View">
          <Link className={`chip no-underline ${calendar ? "" : "on"}`} href={viewHref(sp, "list")}>
            List
          </Link>
          <Link className={`chip no-underline ${calendar ? "on" : ""}`} href={viewHref(sp, "")}>
            <span className="inline-flex items-center gap-1">
              <Icon name="calendar" size={14} /> Calendar
            </span>
          </Link>
        </div>
      </div>
      {calendar ? (
        <TaskCalendar
          tasks={[...tasks.open, ...tasks.done]}
          mode={mode}
          anchor={anchor}
          today={todayIST()}
          showOwner={team}
          people={people}
          targets={targets}
          me={user.id}
        />
      ) : (
        <>
          <div className="mb-3">
            <DateRangeFilter label="Due" />
          </div>
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
      )}
    </>
  );
}

/** Keeps the current filters when switching between list and calendar (the calendar is the default, so it has no view=). */
function viewHref(sp: Record<string, string | undefined>, view: string) {
  const q = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && !["view", "from", "to", "new"].includes(k)) as [string, string][]);
  if (view) q.set("view", view);
  return `/tasks${q.size ? `?${q}` : ""}`;
}
