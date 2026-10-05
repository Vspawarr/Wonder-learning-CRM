"use client";

// The school's own details form (name, contact, mobile, address…), used to correct mistakes from a lead,
// an opportunity or a client. Saving updates every record of the school (R35).
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { editSchool } from "@/app/actions";
import { DESIGNATIONS } from "@/lib/constants";
import type { Locations } from "@/server/locations";
import type { SchoolValues } from "@/lib/school-values";
import { MobileInput } from "@/components/mobile-input";


/** The fields themselves; `original` keeps a state/city that is no longer in Settings → Locations selectable. */
export function SchoolFields<T extends SchoolValues>({ v, setV, locations, original, idp }: { v: T; setV: (v: T) => void; locations: Locations; original: { state: string; city: string }; idp: string }) {
  const set = (k: keyof SchoolValues, val: string) => setV({ ...v, [k]: val });
  const withCurrent = (list: string[], cur: string) => (cur && !list.includes(cur) ? [cur, ...list] : list);
  return (
    <>
      <div className="fg2">
        <Field label="School name *" htmlFor={`${idp}-school`}>
          <input className="in" id={`${idp}-school`} value={v.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
        </Field>
        <Field label="Owner / contact person *" htmlFor={`${idp}-contact`}>
          <input className="in" id={`${idp}-contact`} value={v.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Designation" htmlFor={`${idp}-desig`}>
          <select className="sel" id={`${idp}-desig`} value={v.designation} onChange={(e) => set("designation", e.target.value)}>
            <Options list={DESIGNATIONS} blank="Not specified" />
          </select>
        </Field>
        <Field label="Mobile number *" htmlFor={`${idp}-mobile`}>
          <MobileInput id={`${idp}-mobile`} value={v.mobile} onChange={(m) => set("mobile", m)} />
        </Field>
        <Field label="Email ID" htmlFor={`${idp}-email`}>
          <input className="in" id={`${idp}-email`} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="State *" htmlFor={`${idp}-state`}>
          <select className="sel" id={`${idp}-state`} value={v.state} onChange={(e) => setV({ ...v, state: e.target.value, city: "" })}>
            <option value="">Choose a state</option>
            <Options list={withCurrent(locations.states, v.state)} />
          </select>
        </Field>
        <Field label="City *" htmlFor={`${idp}-city`}>
          <select className="sel" id={`${idp}-city`} value={v.city} disabled={!v.state} onChange={(e) => set("city", e.target.value)}>
            <option value="">Choose a city</option>
            <Options list={withCurrent(locations.cities[v.state] ?? [], v.state === original.state ? v.city || original.city : v.city)} />
          </select>
        </Field>
        <Field label="Area / location" htmlFor={`${idp}-area`}>
          <input className="in" id={`${idp}-area`} value={v.area} onChange={(e) => set("area", e.target.value)} />
        </Field>
      </div>
      <Field label="Address" htmlFor={`${idp}-addr`}>
        <textarea className="ta" id={`${idp}-addr`} value={v.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="fg2">
        <Field label="Current publication / curriculum" htmlFor={`${idp}-curr`}>
          <input className="in" id={`${idp}-curr`} value={v.currentCurriculum} onChange={(e) => set("currentCurriculum", e.target.value)} />
        </Field>
        <Field label="Student strength" htmlFor={`${idp}-str`}>
          <input className="in" id={`${idp}-str`} type="number" min={0} value={v.studentStrength} onChange={(e) => set("studentStrength", e.target.value)} />
        </Field>
        <Field label="Number of branches" htmlFor={`${idp}-br`}>
          <input className="in" id={`${idp}-br`} type="number" min={1} value={v.branches} onChange={(e) => set("branches", e.target.value)} />
        </Field>
      </div>
    </>
  );
}

/** "Edit school details" for a converted / disqualified lead or an opportunity. */
export function SchoolDetailsButton({
  target,
  initial,
  locations,
  small,
}: {
  target: { leadId: string } | { opportunityId: string };
  initial: SchoolValues;
  locations: Locations;
  small?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const { pending, run } = useAction();
  return (
    <>
      <button
        className={small ? "btn sm" : "btn"}
        onClick={() => {
          setV(initial);
          setOpen(true);
        }}
      >
        <Icon name="doc" size={small ? 14 : 16} /> Edit school details
      </button>
      {open ? (
        <Modal
          title="Edit school details"
          sub="Corrections are saved on the lead, the opportunity and the client (if any), so every screen shows the same details."
          wide
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => editSchool(target, v), { success: "School details saved everywhere.", onDone: () => setOpen(false) })}>
                {pending ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <SchoolFields v={v} setV={setV} locations={locations} original={initial} idp="sd" />
        </Modal>
      ) : null}
    </>
  );
}
