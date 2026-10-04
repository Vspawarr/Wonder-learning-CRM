"use client";

import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { updateClient } from "@/app/actions";
import { SchoolFields } from "@/components/school-details";
import type { Locations } from "@/server/locations";
import type { ClientDetail, Option } from "@/server/queries";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Edit the school's details; Admin / Sales Head can also change the account owner. */
export function EditClientButton({ client: c, team, locations, canChangeOwner }: { client: ClientDetail; team: Option[]; locations: Locations; canChangeOwner: boolean }) {
  const init = () => ({
    schoolName: c.schoolName,
    contactName: c.contactName,
    designation: s(c.designation),
    mobile: c.mobile,
    email: s(c.email),
    state: c.state,
    city: c.city,
    area: s(c.area),
    address: s(c.address),
    currentCurriculum: s(c.currentCurriculum),
    studentStrength: s(c.studentStrength),
    branches: s(c.branches),
    ownerId: c.owner.id,
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(init);
  const { pending, run } = useAction();
  const set = (k: keyof ReturnType<typeof init>, val: string) => setV({ ...v, [k]: val });
  const owners = team.some((t) => t.id === c.owner.id) ? team : [c.owner, ...team];
  return (
    <>
      <button
        className="btn"
        onClick={() => {
          setV(init());
          setOpen(true);
        }}
      >
        <Icon name="doc" size={16} /> Edit details
      </button>
      {open ? (
        <Modal
          title="Edit client details"
          sub={c.schoolName}
          wide
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => updateClient(c.id, v), { success: "Client details saved.", onDone: () => setOpen(false) })}>
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <SchoolFields v={v} setV={setV} locations={locations} original={c} idp="ec" />
          <div className="fg2">
            <Field label="Assigned to (salesperson)" htmlFor="ec-owner">
              <select className="sel" id="ec-owner" value={v.ownerId} disabled={!canChangeOwner} onChange={(e) => set("ownerId", e.target.value)}>
                <Options list={owners.map((t) => [t.id, t.name] as const)} />
              </select>
              {canChangeOwner ? <span className="small muted">Their open follow-ups move to the new salesperson.</span> : null}
            </Field>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
