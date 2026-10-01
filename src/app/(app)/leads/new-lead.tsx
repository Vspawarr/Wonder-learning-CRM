"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { createLead } from "@/app/actions";
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
  temperature: "WARM",
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
  const close = () => setOpen(false);

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
                onClick={() =>
                  run(() => createLead(value), {
                    success:
                      value.status === "QUALIFIED"
                        ? "Lead saved and turned into an opportunity."
                        : `Lead saved. Follow-up task created for ${fmtDate(value.nextFollowUpDate)}.`,
                    onDone: (id) => {
                      close();
                      if (id) router.push(`/leads/${id}`);
                    },
                  })
                }
              >
                {pending ? "Saving…" : "Save lead"}
              </button>
            </>
          }
        >
          <LeadForm value={value} onChange={setValue} team={team} locations={locations} idPrefix="nl" />
        </Modal>
      ) : null}
    </>
  );
}
