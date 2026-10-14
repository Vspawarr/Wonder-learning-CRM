import Link from "next/link";
import { BrandLogo, Icon } from "@/components/icons";
import { db } from "@/lib/db";
import { fmtDate, fromDbDate, toDbDate, todayIST } from "@/lib/dates";
import { requireUser } from "@/server/session";

export const metadata = { title: "Today's to-dos" };

const time12 = (hm: string) => {
  const h = Number(hm.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${hm.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
};

/** R45: after login and choosing the year, the person first sees their to-dos for today (and any overdue), then goes on. */
export default async function TodayPage() {
  const user = await requireUser();
  const today = todayIST();
  const rows = await db.task.findMany({
    where: { assigneeId: user.id, status: "OPEN", dueDate: { lte: toDbDate(today) } },
    include: {
      lead: { select: { id: true, schoolName: true } },
      client: { select: { id: true, schoolName: true } },
      opportunity: { select: { id: true, schoolName: true } },
    },
    orderBy: [{ dueDate: "asc" }, { dueTime: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  const overdue = rows.filter((t) => fromDbDate(t.dueDate) < today);
  const due = rows.filter((t) => fromDbDate(t.dueDate) === today);
  const first = user.name.split(" ")[0];
  const item = (t: (typeof rows)[number], late: boolean) => {
    const school = t.client ?? t.opportunity ?? t.lead;
    const href = t.client ? `/clients/${t.client.id}` : t.opportunity ? `/opportunities?opp=${t.opportunity.id}` : t.lead ? `/leads/${t.lead.id}` : "/tasks";
    return (
      <li key={t.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
        <span className={`small w-[74px] shrink-0 font-semibold ${late ? "text-coral" : "text-brand"}`}>
          {late ? fmtDate(fromDbDate(t.dueDate), today) : t.dueTime ? time12(t.dueTime) : "Today"}
        </span>
        <span className="min-w-0">
          <Link href={href} className="font-semibold text-ink">
            {t.title}
          </Link>
          <span className="small muted block">
            {t.type}
            {school ? ` · ${school.schoolName}` : ""}
            {t.priority === "HIGH" || t.priority === "CRITICAL" ? ` · ${t.priority === "HIGH" ? "High" : "Critical"} priority` : ""}
          </span>
        </span>
      </li>
    );
  };
  return (
    <main className="min-h-full bg-bg px-4 pt-[calc(28px+env(safe-area-inset-top,0px))] pb-10">
      <div className="mx-auto mt-[4vh] max-w-[560px]">
        <div className="flex flex-col items-center text-center">
          <BrandLogo width={180} priority />
          <h1 className="mt-3">Good to see you, {first}</h1>
          <p className="muted mt-1">
            {due.length || overdue.length
              ? `You have ${due.length} to-do${due.length === 1 ? "" : "s"} today${overdue.length ? ` and ${overdue.length} overdue` : ""}.`
              : "Nothing is due today. Enjoy the day!"}
          </p>
        </div>
        {overdue.length ? (
          <div className="card mt-5">
            <h2 className="text-coral">Overdue ({overdue.length})</h2>
            <ul className="mt-1">{overdue.map((t) => item(t, true))}</ul>
          </div>
        ) : null}
        {due.length ? (
          <div className="card mt-4">
            <h2>Today ({due.length})</h2>
            <ul className="mt-1">{due.map((t) => item(t, false))}</ul>
            <p className="small muted mt-2">The bell reminds you 15 minutes before each to-do that has a time.</p>
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {rows.length ? (
            <Link href="/tasks" className="btn">
              <Icon name="check" size={16} /> Open my to-dos
            </Link>
          ) : null}
          <Link href="/dashboard" className="btn pri">
            {rows.length ? "Skip, go to dashboard" : "Go to dashboard"}
          </Link>
        </div>
      </div>
    </main>
  );
}
