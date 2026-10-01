"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import Link from "next/link";
import { createLead, findDuplicateLeads } from "@/app/actions";
import type { DuplicateMatch } from "@/server/leads";
import { addDays, fmtDate, todayIST } from "@/lib/dates";
import type { Option } from "@/server/queries";
import type { Locations } from "@/server/locations";
import { LeadForm, type LeadValues } from "./lead-form";

const blank = (assignedToId: string, state: string): LeadValues => ({
  schoolName: "",
  contactName: "",
  designation: "",
  mobile: "",
  email: "",
  state,
  city: "",
  area: "",
  address: "",
  currentCurriculum: "",
  studentStrength: "",
  branches: "",
  source: "",
  referenceName: "",
  status: "NEW",
  temperature: "",
  assignedToId,
  nextFollowUpDate: addDays(todayIST(), 1),
  followUpType: "",
  followUpRemark: "",
});

export function NewLeadButton({
  team,
  locations,
  defaultAssignee,
}: {
  team: Option[];
  locations: Locations;
  defaultAssignee: string;
}) {
  const router = useRouter();
  // Most leads are in Maharashtra; otherwise start empty.
  const defaultState = locations.states.includes("Maharashtra") ? "Maharashtra" : "";
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => blank(defaultAssignee, defaultState));
  const { pending, run } = useAction();
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);
  const close = () => {
    setOpen(false);
    setDups(null);
  };
  const save = () =>
    run(() => createLead(value), {
      success:
        value.status === "QUALIFIED"
          ? "Lead saved and turned into an opportunity."
          : `Lead saved. Follow-up task created for ${fmtDate(value.nextFollowUpDate)}.`,
      onDone: (id) => {
        close();
        if (id) router.push(`/leads/${id}`);
      },
    });
  // Warn first if the school may already be in the CRM; the user can still save.
  const check = () =>
    run(() => findDuplicateLeads({ schoolName: value.schoolName, mobile: value.mobile, city: value.city }), {
      onDone: (m) => (m && m.length ? setDups(m) : save()),
    });

  return (
    <>
      <button
        className="btn pri"
        onClick={() => {
          setValue(blank(defaultAssignee, defaultState));
          setOpen(true);
        }}
      >
        <Icon name="plus" size={16} /> New lead
      </button>
      {open ? (
        <Modal
          title="New lead"
          sub="Fields marked * are required. A follow-up task is created automatically."
          wide
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending}
                onClick={check}
              >
                {pending ? "Saving…" : "Save lead"}
              </button>
            </>
          }
        >
          <LeadForm value={value} onChange={setValue} team={team} locations={locations} idPrefix="nl" />
        </Modal>
      ) : null}
      {dups ? (
        <Modal
          title="This school may already be in the CRM"
          sub="Check before adding it again, so two people don't follow up the same school."
          onClose={() => setDups(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDups(null)}>
                Go back
              </button>
              <button className="btn pri" disabled={pending} onClick={save}>
                {pending ? "Saving…" : "It's different, save anyway"}
              </button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            {dups.map((d) => (
              <div key={d.code} className="rounded-lg border border-line px-3 py-2">
                <b>{d.href ? <Link href={d.href}>{d.schoolName}</Link> : d.schoolName}</b> <span className="small muted">· {d.city}</span>
                <div className="small muted">
                  {d.kind} {d.code} · {d.status} · {d.owner}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
