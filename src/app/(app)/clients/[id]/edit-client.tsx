"use client";

import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { updateClient } from "@/app/actions";
import { DESIGNATIONS } from "@/lib/constants";
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
  const withCurrent = (list: string[], cur: string) => (cur && !list.includes(cur) ? [cur, ...list] : list);
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
          <div className="fg2">
            <Field label="School name *" htmlFor="ec-school">
              <input className="in" id="ec-school" value={v.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
            </Field>
            <Field label="Owner / contact person *" htmlFor="ec-contact">
              <input className="in" id="ec-contact" value={v.contactName} onChange={(e) => set("contactName", e.target.value)} />
            </Field>
            <Field label="Designation" htmlFor="ec-desig">
              <select className="sel" id="ec-desig" value={v.designation} onChange={(e) => set("designation", e.target.value)}>
                <Options list={DESIGNATIONS} blank="Not specified" />
              </select>
            </Field>
            <Field label="Mobile number *" htmlFor="ec-mobile">
              <input className="in" id="ec-mobile" inputMode="tel" value={v.mobile} onChange={(e) => set("mobile", e.target.value)} />
            </Field>
            <Field label="Email ID" htmlFor="ec-email">
              <input className="in" id="ec-email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
            </Field>
            <Field label="State *" htmlFor="ec-state">
              <select className="sel" id="ec-state" value={v.state} onChange={(e) => setV({ ...v, state: e.target.value, city: "" })}>
                <option value="">Choose a state</option>
                <Options list={withCurrent(locations.states, v.state)} />
              </select>
            </Field>
            <Field label="City *" htmlFor="ec-city">
              <select className="sel" id="ec-city" value={v.city} disabled={!v.state} onChange={(e) => set("city", e.target.value)}>
                <option value="">Choose a city</option>
                <Options list={withCurrent(locations.cities[v.state] ?? [], v.state === c.state ? v.city || c.city : v.city)} />
              </select>
            </Field>
            <Field label="Area / location" htmlFor="ec-area">
              <input className="in" id="ec-area" value={v.area} onChange={(e) => set("area", e.target.value)} />
            </Field>
          </div>
          <Field label="Address" htmlFor="ec-addr">
            <textarea className="ta" id="ec-addr" value={v.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <div className="fg2">
            <Field label="Current publication / curriculum" htmlFor="ec-curr">
              <input className="in" id="ec-curr" value={v.currentCurriculum} onChange={(e) => set("currentCurriculum", e.target.value)} />
            </Field>
            <Field label="Student strength" htmlFor="ec-str">
              <input className="in" id="ec-str" type="number" min={0} value={v.studentStrength} onChange={(e) => set("studentStrength", e.target.value)} />
            </Field>
            <Field label="Number of branches" htmlFor="ec-br">
              <input className="in" id="ec-br" type="number" min={1} value={v.branches} onChange={(e) => set("branches", e.target.value)} />
            </Field>
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
