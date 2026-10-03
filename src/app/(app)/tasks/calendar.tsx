"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/client";
import { Icon } from "@/components/icons";
import { AvatarName, Pill } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { addMonths, calendarRange, weekday } from "@/lib/calendar";
import type { TaskRow } from "@/server/queries";
import { CancelModal, CompleteModal, PostponeModal, PRIORITY_LABEL, fmtTime } from "./tasks-client";

// To-do as a calendar, like Google / Teams: a month grid or a week with hours.
// On phones the month shows dots and the chosen day's agenda underneath; the week is a list of days.

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i); // 8 AM – 8 PM
const monthOf = (d: string) => d.slice(0, 7);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** Same text on the server and in the browser (built-in locale formatting can differ between them). */
function label(d: string, opts: { weekday?: "long"; day?: "numeric"; month: "long" | "short"; year?: "numeric" }) {
  const [y, m, dd] = d.split("-").map(Number);
  const month = opts.month === "long" ? MONTHS[m - 1] : MONTHS[m - 1].slice(0, 3);
  return [opts.weekday ? `${WEEKDAYS[weekday(d)]},` : "", opts.day ? String(dd) : "", month, opts.year ? String(y) : ""].filter(Boolean).join(" ");
}

/** Colour of an item: done/cancelled grey, overdue red, own to-do purple, school follow-up blue. */
function tone(t: TaskRow, today: string) {
  if (t.status !== "OPEN") return "ev-done";
  if (t.dueDate < today) return "ev-late";
  return t.related ? "ev-school" : "ev-own";
}

export function TaskCalendar({ tasks, mode, anchor, today, showOwner }: { tasks: TaskRow[]; mode: "month" | "week"; anchor: string; today: string; showOwner: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [picked, setPicked] = useState<TaskRow | null>(null);
  const [day, setDay] = useState<string>(anchor >= calendarRange(mode, anchor).from && anchor <= calendarRange(mode, anchor).to ? anchor : today);
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [postponing, setPostponing] = useState<TaskRow | null>(null);
  const [cancelling, setCancelling] = useState<TaskRow | null>(null);

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${path}?${next}`, { scroll: false });
  };
  const { from } = calendarRange(mode, anchor);
  const days = Array.from({ length: mode === "week" ? 7 : Math.round((Date.parse(calendarRange(mode, anchor).to) - Date.parse(from)) / 864e5) + 1 }, (_, i) =>
    addDays(from, i),
  );
  const byDay = new Map<string, TaskRow[]>();
  for (const t of [...tasks].sort((a, b) => (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99"))) byDay.set(t.dueDate, [...(byDay.get(t.dueDate) ?? []), t]);
  const step = (n: number) => go({ d: mode === "week" ? addDays(anchor, 7 * n) : addMonths(anchor, n) });
  const title =
    mode === "week"
      ? `${label(days[0], { day: "numeric", month: "short" })} – ${label(days[6], { day: "numeric", month: "short", year: "numeric" })}`
      : label(anchor, { month: "long", year: "numeric" });

  const chip = (t: TaskRow) => (
    <button key={t.id} className={`cev ${tone(t, today)}`} onClick={() => setPicked(t)} title={t.title}>
      {t.dueTime ? <b>{fmtTime(t.dueTime).replace(":00", "")} </b> : null}
      {t.title}
    </button>
  );

  return (
    <div className="card cal">
      <div className="cal-bar">
        <div className="flex items-center gap-1.5">
          <button className="btn sm" onClick={() => go({ d: "" })}>
            Today
          </button>
          <button className="iconbtn h-8 w-8" aria-label={mode === "week" ? "Previous week" : "Previous month"} onClick={() => step(-1)}>
            ‹
          </button>
          <button className="iconbtn h-8 w-8" aria-label={mode === "week" ? "Next week" : "Next month"} onClick={() => step(1)}>
            ›
          </button>
          <h2 className="ml-1 text-[17px]">{title}</h2>
        </div>
        <div className="chips" role="group" aria-label="Calendar view">
          <button className={`chip ${mode === "month" ? "on" : ""}`} onClick={() => go({ cal: "" })}>
            Month
          </button>
          <button className={`chip ${mode === "week" ? "on" : ""}`} onClick={() => go({ cal: "week" })}>
            Week
          </button>
        </div>
      </div>
      <div className="cal-legend small muted">
        <span><i className="ev-school" /> School follow-up</span>
        <span><i className="ev-own" /> Own to-do</span>
        <span><i className="ev-late" /> Overdue</span>
        <span><i className="ev-done" /> Done / cancelled</span>
      </div>

      {mode === "month" ? (
        <>
          <div className="cal-month">
            {DAYS.map((d) => (
              <div key={d} className="cal-dow">
                {d}
              </div>
            ))}
            {days.map((d) => {
              const ts = byDay.get(d) ?? [];
              return (
                <div
                  key={d}
                  className={`cal-cell ${monthOf(d) !== monthOf(anchor) ? "out" : ""} ${d === today ? "today" : ""} ${d === day ? "sel" : ""}`}
                  onClick={() => setDay(d)}
                >
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  <div className="cal-evs">
                    {ts.slice(0, 3).map(chip)}
                    {ts.length > 3 ? <span className="cal-more">+{ts.length - 3} more</span> : null}
                  </div>
                  <div className="cal-dots" aria-hidden="true">
                    {ts.slice(0, 4).map((t) => (
                      <i key={t.id} className={tone(t, today)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <Agenda day={day} tasks={byDay.get(day) ?? []} today={today} onPick={setPicked} className="cal-agenda" />
        </>
      ) : (
        <>
          <div className="cal-week">
            <div />
            {days.map((d) => (
              <button key={d} className={`cal-wday ${d === today ? "today" : ""}`} onClick={() => setDay(d)}>
                <span>{DAYS[weekday(d)]}</span>
                <b>{Number(d.slice(8))}</b>
              </button>
            ))}
            <div className="cal-hour">All day</div>
            {days.map((d) => (
              <div key={d} className="cal-slot allday">
                {(byDay.get(d) ?? []).filter((t) => !t.dueTime).map(chip)}
              </div>
            ))}
            {HOURS.map((h) => (
              <Hour key={h} h={h} days={days} byDay={byDay} chip={chip} />
            ))}
          </div>
          <div className="cal-weeklist">
            {days.map((d) => (
              <Agenda key={d} day={d} tasks={byDay.get(d) ?? []} today={today} onPick={setPicked} />
            ))}
          </div>
        </>
      )}

      {picked ? (
        <Modal
          title={picked.title}
          sub={`${label(picked.dueDate, { weekday: "long", day: "numeric", month: "long" })}${picked.dueTime ? ` · ${fmtTime(picked.dueTime)}` : ""}`}
          onClose={() => setPicked(null)}
          footer={
            picked.status === "OPEN" ? (
              <>
                <button className="btn ghost" onClick={() => (setCancelling(picked), setPicked(null))}>
                  Cancel to-do
                </button>
                <button className="btn" onClick={() => (setPostponing(picked), setPicked(null))}>
                  <Icon name="calendar" size={14} /> Postpone
                </button>
                <button className="btn pri" onClick={() => (setCompleting(picked), setPicked(null))}>
                  <Icon name="check" size={14} /> Done
                </button>
              </>
            ) : (
              <button className="btn" onClick={() => setPicked(null)}>
                Close
              </button>
            )
          }
        >
          <div className="flex flex-wrap gap-1.5">
            <Pill>{picked.type}</Pill>
            {picked.isAuto ? <Pill>Auto</Pill> : null}
            {picked.priority === "HIGH" || picked.priority === "CRITICAL" ? <Pill tone="warn">{PRIORITY_LABEL[picked.priority]}</Pill> : null}
            {picked.status !== "OPEN" ? <Pill tone="mute">{picked.status === "DONE" ? "Done" : "Cancelled"}</Pill> : null}
          </div>
          {picked.related ? (
            <p className="mt-3">
              <Link href={picked.related.href}>{picked.related.label}</Link>
            </p>
          ) : null}
          {picked.remark && picked.remark !== picked.title ? <p className="muted mt-2">{picked.remark}</p> : null}
          {picked.outcome ? <p className="muted mt-2">Outcome: {picked.outcome}</p> : null}
          {showOwner ? (
            <div className="mt-3">
              <AvatarName id={picked.assignee.id} name={picked.assignee.name} />
            </div>
          ) : null}
        </Modal>
      ) : null}
      {completing ? <CompleteModal task={completing} onClose={() => setCompleting(null)} /> : null}
      {postponing ? <PostponeModal task={postponing} onClose={() => setPostponing(null)} /> : null}
      {cancelling ? <CancelModal task={cancelling} onClose={() => setCancelling(null)} /> : null}
    </div>
  );
}

function Hour({ h, days, byDay, chip }: { h: number; days: string[]; byDay: Map<string, TaskRow[]>; chip: (t: TaskRow) => React.ReactNode }) {
  const inHour = (t: TaskRow) => {
    if (!t.dueTime) return false;
    const hh = Number(t.dueTime.slice(0, 2));
    return h === HOURS[0] ? hh <= h : h === HOURS[HOURS.length - 1] ? hh >= h : hh === h;
  };
  return (
    <>
      <div className="cal-hour">{h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}</div>
      {days.map((d) => (
        <div key={d} className="cal-slot">
          {(byDay.get(d) ?? []).filter(inHour).map(chip)}
        </div>
      ))}
    </>
  );
}

function Agenda({ day, tasks, today, onPick, className }: { day: string; tasks: TaskRow[]; today: string; onPick: (t: TaskRow) => void; className?: string }) {
  return (
    <div className={`cal-day ${className ?? ""}`}>
      <h3 className={day === today ? "text-brand" : ""}>{label(day, { weekday: "long", day: "numeric", month: "short" })}</h3>
      {tasks.length ? (
        tasks.map((t) => (
          <button key={t.id} className={`cal-row ${tone(t, today)}`} onClick={() => onPick(t)}>
            <i aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{t.title}</span>
              <span className="small muted block truncate">
                {t.dueTime ? `${fmtTime(t.dueTime)} · ` : ""}
                {t.type}
                {t.related ? ` · ${t.related.label}` : ""}
              </span>
            </span>
          </button>
        ))
      ) : (
        <div className="small faint py-1">Nothing planned.</div>
      )}
    </div>
  );
}
