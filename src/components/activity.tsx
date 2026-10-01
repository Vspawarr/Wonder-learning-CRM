"use client";

import { DateInput } from "./date-input";
import { useState } from "react";
import { Field, Modal, Options, useAction } from "./client";
import { Icon } from "./icons";
import { useRouter } from "next/navigation";
import { CategoryPicker } from "./category-picker";
import { convertLead, logActivity } from "@/app/actions";
import { fmtDate, todayIST } from "@/lib/dates";

export type ActivityItem = {
  id: string;
  type: string;
  subject: string;
  summary: string | null;
  nextAction: string | null;
  at: string;
  by: { id: string; name: string };
};

const TYPE_LABEL: Record<string, string> = {
  PHONE: "Call",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  MEETING: "Meeting",
  SITE_VISIT: "School visit",
  NOTE: "Note",
  SYSTEM: "Update",
};
const TYPE_COLOR: Record<string, string> = {
  PHONE: "#5B6B8C",
  WHATSAPP: "#0E8F79",
  EMAIL: "#5B6B8C",
  MEETING: "#7A48B8",
  SITE_VISIT: "#7A48B8",
  NOTE: "#E8930C",
  SYSTEM: "#3D3BA8",
};

const when = (iso: string) => {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" }).format(d);
  return `${fmtDate(day)}, ${time}`;
};

export function ActivityLog({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <div className="small muted mt-2">No activity yet.</div>;
  return (
    <ul className="m-0 list-none p-0 pl-1.5">
      {items.map((a, i) => (
        <li
          key={a.id}
          className={`relative ml-1.5 border-l-2 pb-4 pl-6 ${i === items.length - 1 ? "border-transparent" : "border-line"}`}
        >
          <span
            className="absolute top-[3px] -left-[7px] h-3 w-3 rounded-full border-2 border-surf"
            style={{ background: TYPE_COLOR[a.type] ?? "var(--brand)" }}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <b className={a.type === "SYSTEM" ? "font-semibold text-ink2" : ""}>{a.subject}</b>
            <span className="small faint">
              {when(a.at)} · {TYPE_LABEL[a.type] ?? a.type} · {a.by.name}
            </span>
          </div>
          {a.summary ? <div className="small muted whitespace-pre-line">{a.summary}</div> : null}
          {a.nextAction ? <div className="small mt-0.5">Next: {a.nextAction}</div> : null}
        </li>
      ))}
    </ul>
  );
}

const LOG_TYPES: [string, string][] = [
  ["PHONE", "Call"],
  ["WHATSAPP", "WhatsApp"],
  ["EMAIL", "Email"],
  ["MEETING", "Meeting"],
  ["SITE_VISIT", "School visit"],
  ["NOTE", "Note"],
];

export function LogInteractionButton({
  leadId,
  opportunityId,
  clientId,
  disabled,
  canConvert,
}: {
  leadId?: string;
  opportunityId?: string;
  clientId?: string;
  disabled?: boolean;
  /** Offer "convert this lead to an opportunity" after logging. */
  canConvert?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [convert, setConvert] = useState(false);
  const [cat, setCat] = useState("");
  const router = useRouter();
  const [v, setV] = useState({ type: "PHONE", subject: "", summary: "", nextAction: "", followUpDate: "" });
  const { pending, run } = useAction();
  const close = () => {
    setOpen(false);
    setConvert(false);
    setCat("");
    setV({ type: "PHONE", subject: "", summary: "", nextAction: "", followUpDate: "" });
  };
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)} disabled={disabled}>
        <Icon name="plus" size={16} /> Log interaction
      </button>
      {open ? (
        <Modal
          title="Log an interaction"
          sub="Adds to the activity log straight away."
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending || (convert && !cat)}
                onClick={() =>
                  run(
                    async () => {
                      const r = await logActivity({ ...v, leadId, opportunityId, clientId });
                      if (!r.ok || !(convert && leadId)) return { ...r, data: undefined as string | undefined };
                      return convertLead(leadId, { temperature: cat });
                    },
                    {
                      success: convert
                        ? "Interaction logged and lead converted to an opportunity."
                        : v.followUpDate
                          ? "Interaction logged and follow-up booked."
                          : "Interaction logged.",
                      onDone: (oppId) => {
                        close();
                        if (oppId) router.push(`/opportunities?opp=${oppId}`);
                      },
                    },
                  )
                }
              >
                Save
              </button>
            </>
          }
        >
          <div className="fg2">
            <Field label="Type" htmlFor="li-type">
              <select className="sel" id="li-type" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>
                <Options list={LOG_TYPES} />
              </select>
            </Field>
            <Field label="Subject" htmlFor="li-sub">
              <input className="in" id="li-sub" placeholder="Short title" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />
            </Field>
          </div>
          <Field label="What was discussed *" htmlFor="li-sum">
            <textarea className="ta" id="li-sum" value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} />
          </Field>
          <div className="fg2">
            <Field label="Next action" htmlFor="li-next">
              <input className="in" id="li-next" value={v.nextAction} onChange={(e) => setV({ ...v, nextAction: e.target.value })} />
            </Field>
            <Field label="Follow-up date (creates a task)" htmlFor="li-date">
              <DateInput id="li-date" min={todayIST()} value={v.followUpDate} onChange={(followUpDate) => setV({ ...v, followUpDate })} />
            </Field>
          </div>
          {canConvert && leadId ? (
            <label className="mt-1 flex items-start gap-2.5 rounded-lg border border-line p-3">
              <input type="checkbox" className="mt-1" checked={convert} onChange={(e) => setConvert(e.target.checked)} />
              <span>
                <b>Convert to opportunity</b>
                <span className="small muted block">The school is interested: after saving, it moves to the Pipeline as Interested.</span>
              </span>
            </label>
          ) : null}
          {convert ? (
            <div className="mt-3">
              <div className="mb-1.5 font-semibold">Category *</div>
              <CategoryPicker value={cat} onChange={setCat} />
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
