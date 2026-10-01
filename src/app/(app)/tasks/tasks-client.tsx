"use client";

import { DateInput } from "@/components/date-input";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { AvatarName, DueTag, Pill } from "@/components/ui";
import { completeTask, createTask } from "@/app/actions";
import { FOLLOWUP_TYPES } from "@/lib/constants";
import { addDays, daysFrom, todayIST } from "@/lib/dates";
import type { Option, TaskRow } from "@/server/queries";

const PRIORITY_LABEL: Record<string, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", CRITICAL: "Critical" };

export function TeamToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <label className="small flex items-center gap-2">
      <input type="checkbox" checked={on} onChange={(e) => router.replace(e.target.checked ? `${path}?team=1` : path, { scroll: false })} />
      Show whole team
    </label>
  );
}

export function TaskBoard({ open, done, today, showOwner }: { open: TaskRow[]; done: TaskRow[]; today: string; showOwner: boolean }) {
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const groups: [string, TaskRow[]][] = [
    ["Overdue", open.filter((t) => daysFrom(t.dueDate, today) < 0)],
    ["Today", open.filter((t) => daysFrom(t.dueDate, today) === 0)],
    ["Upcoming", open.filter((t) => daysFrom(t.dueDate, today) > 0)],
  ];
  return (
    <>
      {groups.map(([label, ts]) => (
        <div key={label} className="card mb-3">
          <h2>
            {label} <span className="small muted">{ts.length}</span>
          </h2>
          {ts.map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 border-b border-line py-2 last:border-0">
              <button className="btn sm" onClick={() => setCompleting(t)} aria-label={`Complete: ${t.title}`}>
                <Icon name="check" size={14} /> Done
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {t.title} {t.isAuto ? <Pill>Auto</Pill> : null}
                </div>
                <div className="small muted">
                  {t.related ? (
                    <>
                      <Link href={t.related.href}>{t.related.label}</Link> ·{" "}
                    </>
                  ) : null}
                  {t.type} · <DueTag date={t.dueDate} today={today} />
                  {t.remark && t.remark !== t.title ? ` · ${t.remark}` : ""}
                </div>
              </div>
              {t.priority === "HIGH" || t.priority === "CRITICAL" ? <Pill>{PRIORITY_LABEL[t.priority]}</Pill> : null}
              {showOwner ? (
                <span className="hidden min-[700px]:inline">
                  <AvatarName id={t.assignee.id} name={t.assignee.name} />
                </span>
              ) : null}
            </div>
          ))}
          {!ts.length ? <div className="small faint">Nothing here.</div> : null}
        </div>
      ))}
      {done.length ? (
        <div className="card">
          <h2>Recently completed</h2>
          {done.map((t) => (
            <div key={t.id} className="small muted py-1">
              <Icon name="check" size={14} /> {t.title} – {t.outcome || "done"}
            </div>
          ))}
        </div>
      ) : null}
      {completing ? <CompleteModal task={completing} onClose={() => setCompleting(null)} /> : null}
    </>
  );
}

function CompleteModal({ task, onClose }: { task: TaskRow; onClose: () => void }) {
  const [outcome, setOutcome] = useState("");
  const [nextDate, setNextDate] = useState("");
  const { pending, run } = useAction();
  return (
    <Modal
      title="Complete task"
      sub={task.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(() => completeTask(task.id, { outcome, nextDate }), {
                success: nextDate ? "Task completed and next follow-up scheduled." : "Task completed.",
                onDone: onClose,
              })
            }
          >
            Mark done
          </button>
        </>
      }
    >
      <Field label="Outcome" htmlFor="ct-out">
        <textarea className="ta" id="ct-out" placeholder="What happened?" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      </Field>
      <Field label="Next follow-up date (optional)" htmlFor="ct-next">
        <DateInput id="ct-next" min={todayIST()} value={nextDate} onChange={setNextDate} />
      </Field>
    </Modal>
  );
}

export function NewTaskButton({ people, targets, me }: { people: Option[]; targets: { value: string; label: string }[]; me: string }) {
  const blank = () => ({
    title: "",
    related: "",
    type: "Call",
    dueDate: addDays(todayIST(), 1),
    priority: "MEDIUM",
    assigneeId: people.some((p) => p.id === me) ? me : "",
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(blank);
  const { pending, run } = useAction();
  const close = () => setOpen(false);
  const [kind, id] = v.related.split(":");
  return (
    <>
      <button
        className="btn pri"
        onClick={() => {
          setV(blank());
          setOpen(true);
        }}
      >
        <Icon name="plus" size={16} /> New task
      </button>
      {open ? (
        <Modal
          title="New task"
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      createTask({
                        title: v.title,
                        type: v.type,
                        dueDate: v.dueDate,
                        priority: v.priority,
                        assigneeId: v.assigneeId,
                        leadId: kind === "lead" ? id : null,
                        opportunityId: kind === "opp" ? id : null,
                        clientId: kind === "client" ? id : null,
                      }),
                    { success: "Task created.", onDone: close },
                  )
                }
              >
                Create task
              </button>
            </>
          }
        >
          <Field label="Task *" htmlFor="nt-title">
            <input className="in" id="nt-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
          </Field>
          <Field label="Related to" htmlFor="nt-rel">
            <select className="sel" id="nt-rel" value={v.related} onChange={(e) => setV({ ...v, related: e.target.value })}>
              <Options list={targets.map((t) => [t.value, t.label] as const)} blank="Nothing specific" />
            </select>
          </Field>
          <div className="fg2">
            <Field label="Type" htmlFor="nt-type">
              <select className="sel" id="nt-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
                <Options list={[...FOLLOWUP_TYPES, "Other"]} />
              </select>
            </Field>
            <Field label="Due" htmlFor="nt-due">
              <DateInput id="nt-due" value={v.dueDate} onChange={(dueDate) => setV({ ...v, dueDate })} />
            </Field>
            <Field label="Priority" htmlFor="nt-prio">
              <select className="sel" id="nt-prio" value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>
                <Options list={Object.entries(PRIORITY_LABEL) as [string, string][]} />
              </select>
            </Field>
            <Field label="Assign to" htmlFor="nt-by">
              <select className="sel" id="nt-by" value={v.assigneeId} disabled={people.length === 1} onChange={(e) => setV({ ...v, assigneeId: e.target.value })}>
                {people.length > 1 ? <option value="">Choose a person</option> : null}
                <Options list={people.map((p) => [p.id, p.name] as const)} />
              </select>
            </Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
