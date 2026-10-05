"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { ConvertLeadButton } from "@/components/convert-lead";
import { LogInteractionButton } from "@/components/activity";
import { disqualifyLead, updateLead } from "@/app/actions";
import { LOST_REASONS } from "@/lib/constants";
import type { LeadDetail, Option } from "@/server/queries";
import { LeadForm, type LeadValues } from "../lead-form";
import type { Locations } from "@/server/locations";
import { openWhatsApp } from "@/lib/phone";

const ACTIVE = ["NEW", "CONTACTED", "QUALIFIED"];

function toValues(l: LeadDetail): LeadValues {
  const s = (v: string | number | null) => (v === null ? "" : String(v));
  return {
    schoolName: l.schoolName,
    contactName: l.contactName,
    designation: s(l.designation),
    mobile: l.mobile,
    email: s(l.email),
    state: l.state,
    city: l.city,
    area: s(l.area),
    address: s(l.address),
    currentCurriculum: s(l.currentCurriculum),
    studentStrength: s(l.studentStrength),
    branches: s(l.branches),
    source: l.source,
    referenceName: s(l.referenceName),
    status: l.status,
    temperature: "",
    assignedToId: l.assignedTo.id,
    nextFollowUpDate: s(l.nextFollowUpDate),
    followUpType: s(l.followUpType),
    followUpRemark: s(l.followUpRemark),
  };
}

export function LeadEditor({
  lead,
  team,
  locations,
}: {
  lead: LeadDetail;
  team: Option[];
  locations: Locations;
}) {
  const initial = toValues(lead);
  const [value, setValue] = useState(initial);
  const { pending, run } = useAction();
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  return (
    <>
      <LeadForm key={lead.id} value={value} onChange={setValue} team={team} locations={locations} idPrefix="el" />
      <div className="sticky bottom-0 -mx-4 -mb-4 flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-line bg-surf px-4 py-3">
        {!dirty && !pending ? <span className="small muted mr-auto self-center">Change a field to save</span> : null}
        <button className="btn" disabled={!dirty || pending} onClick={() => setValue(initial)}>
          Discard changes
        </button>
        <button className="btn pri" disabled={!dirty || pending} onClick={() => run(() => updateLead(lead.id, value), { success: "Lead saved." })}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </>
  );
}

export function LeadActions({ lead }: { lead: LeadDetail }) {
  const active = ACTIVE.includes(lead.status);
  const [disq, setDisq] = useState(false);
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const { pending, run } = useAction();
  const tel = lead.mobile.replace(/[^\d+]/g, "");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn" href={`tel:${tel}`}>
        <Icon name="phone" size={16} /> Call
      </a>
      <button className="btn" onClick={() => openWhatsApp(lead.mobile)}>
        <Icon name="chat" size={16} /> WhatsApp
      </button>
      <LogInteractionButton leadId={lead.id} canConvert={active && !lead.opportunity} />
      {active && !lead.opportunity ? <ConvertLeadButton leadId={lead.id} schoolName={lead.schoolName} /> : null}
      {active ? (
        <button className="btn" onClick={() => setDisq(true)}>
          Disqualify
        </button>
      ) : null}
      {lead.opportunity ? (
        <Link className="btn" href={`/opportunities?opp=${lead.opportunity.id}`}>
          Open opportunity
        </Link>
      ) : null}

      {disq ? (
        <Modal
          title="Disqualify lead"
          sub="A reason is needed for reporting. Open follow-ups for this lead are cancelled."
          onClose={() => setDisq(false)}
          footer={
            <>
              <button className="btn" onClick={() => setDisq(false)}>
                Back
              </button>
              <button
                className="btn bad"
                disabled={pending || !reason}
                onClick={() =>
                  run(() => disqualifyLead(lead.id, { reason, remarks }), {
                    success: "Lead disqualified.",
                    onDone: () => setDisq(false),
                  })
                }
              >
                Disqualify
              </button>
            </>
          }
        >
          <Field label="Reason *" htmlFor="dq-reason">
            <select className="sel" id="dq-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <Options list={LOST_REASONS} blank="Choose a reason" />
            </select>
          </Field>
          <Field label="Remarks" htmlFor="dq-rem">
            <textarea className="ta" id="dq-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
