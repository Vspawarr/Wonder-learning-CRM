"use client";

import { DateInput } from "@/components/date-input";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { AvatarName, DueTag, Pill } from "@/components/ui";
import {
  cancelTask,
  completeTask,
  createTask,
  postponeTask,
} from "@/app/actions";
import { FOLLOWUP_TYPES, TODO_TYPES } from "@/lib/constants";
import { addDays, daysFrom, todayIST } from "@/lib/dates";
import type { InvoiceRow } from "@/server/finance/service";
import type { Option, TaskRow } from "@/server/queries";
import { InvoiceButtons } from "../clients/[id]/finance";

export const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

/** "14:30" → "2:30 PM". */
export function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Show: All / Follow-ups / My to-dos, plus the whole-team switch for managers. */
export function TodoFilters({ canTeam }: { canTeam: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(next.size ? `${path}?${next}` : path, { scroll: false });
  };
  const kind = sp.get("kind") ?? "";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {(
          [
            ["", "Everything"],
            ["followups", "School follow-ups"],
            ["todos", "My own to-dos"],
          ] as const
        ).map(([v, l]) => (
          <button
            key={l}
            className={`chip ${kind === v ? "on" : ""}`}
            onClick={() => set("kind", v)}
          >
            {l}
          </button>
        ))}
      </div>
      {canTeam ? (
        <label className="small flex items-center gap-2">
          <input
            type="checkbox"
            checked={sp.get("team") === "1"}
            onChange={(e) => set("team", e.target.checked ? "1" : "")}
          />
          Show whole team
        </label>
      ) : null}
    </div>
  );
}

export function TaskBoard({
  open,
  done,
  today,
  showOwner,
  invoices = {},
  emailReady = false,
  me = { name: "" },
}: {
  open: TaskRow[];
  done: TaskRow[];
  today: string;
  showOwner: boolean;
  invoices?: Record<string, InvoiceRow>;
  emailReady?: boolean;
  me?: { name: string };
}) {
  const [completing, setCompleting] = useState<TaskRow | null>(null);
  const [postponing, setPostponing] = useState<TaskRow | null>(null);
  const [cancelling, setCancelling] = useState<TaskRow | null>(null);
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
            <div
              key={t.id}
              className="border-b border-line py-2.5 last:border-0"
            >
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {t.title} {t.isAuto ? <Pill>Auto</Pill> : null}{" "}
                    {t.priority === "HIGH" || t.priority === "CRITICAL" ? (
                      <Pill>{PRIORITY_LABEL[t.priority]}</Pill>
                    ) : null}{" "}
                    {t.postponedCount ? (
                      <Pill tone="warn">{`Postponed ${t.postponedCount}×`}</Pill>
                    ) : null}
                  </div>
                  <div className="small muted">
                    {t.related ? (
                      <>
                        <Link href={t.related.href}>{t.related.label}</Link>{" "}
                        ·{" "}
                      </>
                    ) : null}
                    {t.type} · <DueTag date={t.dueDate} today={today} />
                    {t.dueTime ? ` · ${fmtTime(t.dueTime)}` : ""}
                    {t.remark && t.remark !== t.title ? ` · ${t.remark}` : ""}
                    {t.postponeReason
                      ? ` · last postponed: ${t.postponeReason}`
                      : ""}
                  </div>
                </div>
                {showOwner ? (
                  <span className="hidden min-[700px]:inline">
                    <AvatarName id={t.assignee.id} name={t.assignee.name} />
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  className="btn sm pri"
                  onClick={() => setCompleting(t)}
                  aria-label={`Done: ${t.title}`}
                >
                  <Icon name="check" size={14} /> Done
                </button>
                <button
                  className="btn sm"
                  onClick={() => setPostponing(t)}
                  aria-label={`Postpone: ${t.title}`}
                >
                  <Icon name="calendar" size={14} /> Postpone
                </button>
                <button
                  className="btn sm ghost"
                  onClick={() => setCancelling(t)}
                  aria-label={`Cancel: ${t.title}`}
                >
                  Cancel
                </button>
                {t.invoiceId && invoices[t.invoiceId] ? (
                  <InvoiceButtons
                    row={invoices[t.invoiceId]}
                    contact={invoices[t.invoiceId].client}
                    emailReady={emailReady}
                    me={me}
                    compact
                  />
                ) : null}
              </div>
            </div>
          ))}
          {!ts.length ? <div className="empty small">Nothing here.</div> : null}
        </div>
      ))}
      {done.length ? (
        <div className="card">
          <h2>Recently closed</h2>
          {done.map((t) => (
            <div key={t.id} className="small muted py-1">
              {t.status === "CANCELLED" ? "✕" : <Icon name="check" size={14} />}{" "}
              {t.title} –{" "}
              {t.status === "CANCELLED"
                ? `cancelled${t.outcome && t.outcome !== "Cancelled" ? `: ${t.outcome}` : ""}`
                : t.outcome || "done"}
            </div>
          ))}
        </div>
      ) : null}
      {completing ? (
        <CompleteModal task={completing} onClose={() => setCompleting(null)} />
      ) : null}
      {postponing ? (
        <PostponeModal task={postponing} onClose={() => setPostponing(null)} />
      ) : null}
      {cancelling ? (
        <CancelModal task={cancelling} onClose={() => setCancelling(null)} />
      ) : null}
    </>
  );
}

export function CompleteModal({
  task,
  onClose,
}: {
  task: TaskRow;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState("");
  const [nextDate, setNextDate] = useState("");
  const { pending, run } = useAction();
  return (
    <Modal
      title="Mark as done"
      sub={task.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Back
          </button>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(() => completeTask(task.id, { outcome, nextDate }), {
                success: nextDate
                  ? "Done, and the next follow-up is booked."
                  : "Marked as done.",
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
        <textarea
          className="ta"
          id="ct-out"
          placeholder="What happened?"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
      </Field>
      <Field label="Next follow-up date (optional)" htmlFor="ct-next">
        <DateInput
          id="ct-next"
          min={todayIST()}
          value={nextDate}
          onChange={setNextDate}
        />
      </Field>
    </Modal>
  );
}

export function PostponeModal({
  task,
  onClose,
}: {
  task: TaskRow;
  onClose: () => void;
}) {
  const today = todayIST();
  const [date, setDate] = useState(
    addDays(task.dueDate < today ? today : task.dueDate, 1),
  );
  const [time, setTime] = useState(task.dueTime ?? "");
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  const quick: [string, string][] = [
    ["Tomorrow", addDays(today, 1)],
    ["In 2 days", addDays(today, 2)],
    ["Next week", addDays(today, 7)],
  ];
  return (
    <Modal
      title="Postpone"
      sub={task.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Back
          </button>
          <button
            className="btn pri"
            disabled={pending || !date}
            onClick={() =>
              run(
                () =>
                  postponeTask(task.id, {
                    dueDate: date,
                    dueTime: time,
                    reason,
                  }),
                { success: "Postponed.", onDone: onClose },
              )
            }
          >
            Postpone
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {quick.map(([l, d]) => (
          <button
            key={l}
            className={`chip ${date === d ? "on" : ""}`}
            onClick={() => setDate(d)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="New date *" htmlFor="pp-date">
          <DateInput id="pp-date" min={today} value={date} onChange={setDate} />
        </Field>
        <Field label="Time (optional)" htmlFor="pp-time">
          <input
            className="in"
            id="pp-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
      </div>
      <Field label="Reason" htmlFor="pp-why">
        <input
          className="in"
          id="pp-why"
          placeholder="e.g. Principal on leave"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Modal>
  );
}

export function CancelModal({
  task,
  onClose,
}: {
  task: TaskRow;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const { pending, run } = useAction();
  return (
    <Modal
      title="Cancel this task?"
      sub={task.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Back
          </button>
          <button
            className="btn bad"
            disabled={pending}
            onClick={() =>
              run(() => cancelTask(task.id, { reason }), {
                success: "Task cancelled.",
                onDone: onClose,
              })
            }
          >
            Cancel task
          </button>
        </>
      }
    >
      <Field label="Reason (optional)" htmlFor="cx-why">
        <input
          className="in"
          id="cx-why"
          placeholder="e.g. No longer needed"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      {task.invoiceId ? (
        <p className="small muted">
          This is a payment follow-up. A new one is created automatically when
          the next part payment is recorded.
        </p>
      ) : null}
    </Modal>
  );
}

export function NewTaskButton({
  people,
  targets,
  me,
  autoOpen = false,
}: {
  people: Option[];
  targets: { value: string; label: string }[];
  me: string;
  /** Open straight away (from the top bar's "+ Add → New to-do"). */
  autoOpen?: boolean;
}) {
  const blank = () => ({
    title: "",
    related: "",
    type: "Internal Meeting",
    dueDate: todayIST(),
    dueTime: "",
    priority: "MEDIUM",
    remark: "",
    assigneeId: people.some((p) => p.id === me) ? me : "",
  });
  const [open, setOpen] = useState(autoOpen);
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
        <Icon name="plus" size={16} /> New to-do
      </button>
      {open ? (
        <Modal
          title="New to-do"
          sub="Your own work (meetings, documents…) or a follow-up with a school."
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
                        dueTime: v.dueTime,
                        priority: v.priority,
                        remark: v.remark,
                        assigneeId: v.assigneeId,
                        leadId: kind === "lead" ? id : null,
                        opportunityId: kind === "opp" ? id : null,
                        clientId: kind === "client" ? id : null,
                      }),
                    { success: "Added to To-do.", onDone: close },
                  )
                }
              >
                Add
              </button>
            </>
          }
        >
          <Field label="What needs doing? *" htmlFor="nt-title">
            <input
              className="in"
              id="nt-title"
              placeholder="e.g. Prepare franchise agreement"
              value={v.title}
              onChange={(e) => setV({ ...v, title: e.target.value })}
            />
          </Field>
          <div className="fg2">
            <Field label="Type" htmlFor="nt-type">
              <select
                className="sel"
                id="nt-type"
                value={v.type}
                onChange={(e) => setV({ ...v, type: e.target.value })}
              >
                <optgroup label="My own work">
                  <Options list={TODO_TYPES} />
                </optgroup>
                <optgroup label="Follow-up with a school">
                  <Options list={FOLLOWUP_TYPES} />
                </optgroup>
              </select>
            </Field>
            <Field label="Related to" htmlFor="nt-rel">
              <select
                className="sel"
                id="nt-rel"
                value={v.related}
                onChange={(e) => setV({ ...v, related: e.target.value })}
              >
                <Options
                  list={targets.map((t) => [t.value, t.label] as const)}
                  blank="Nothing specific"
                />
              </select>
            </Field>
            <Field label="Date *" htmlFor="nt-due">
              <DateInput
                id="nt-due"
                value={v.dueDate}
                onChange={(dueDate) => setV({ ...v, dueDate })}
              />
            </Field>
            <Field label="Time (optional)" htmlFor="nt-time">
              <input
                className="in"
                id="nt-time"
                type="time"
                value={v.dueTime}
                onChange={(e) => setV({ ...v, dueTime: e.target.value })}
              />
            </Field>
            <Field label="Priority" htmlFor="nt-prio">
              <select
                className="sel"
                id="nt-prio"
                value={v.priority}
                onChange={(e) => setV({ ...v, priority: e.target.value })}
              >
                <Options
                  list={Object.entries(PRIORITY_LABEL) as [string, string][]}
                />
              </select>
            </Field>
            <Field label="For" htmlFor="nt-by">
              <select
                className="sel"
                id="nt-by"
                value={v.assigneeId}
                disabled={people.length === 1}
                onChange={(e) => setV({ ...v, assigneeId: e.target.value })}
              >
                {people.length > 1 ? (
                  <option value="">Choose a person</option>
                ) : null}
                <Options list={people.map((p) => [p.id, p.name] as const)} />
              </select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="nt-notes">
            <input
              className="in"
              id="nt-notes"
              placeholder="Optional"
              value={v.remark}
              onChange={(e) => setV({ ...v, remark: e.target.value })}
            />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}
