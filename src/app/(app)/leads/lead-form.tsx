"use client";

import { useState } from "react";
import { Field, Options } from "@/components/client";
import {
  DESIGNATIONS,
  FOLLOWUP_TYPES,
  LEAD_STATUS_LABEL,
  MANUAL_LEAD_STATUSES,
  PUBLICATIONS,
  REF_SOURCES,
  SOURCES,
  STATES,
  TEMPERATURE_LABEL,
} from "@/lib/constants";
import type { Option, ProductOption } from "@/server/queries";

export type LeadValues = {
  schoolName: string;
  contactName: string;
  designation: string;
  mobile: string;
  email: string;
  state: string;
  city: string;
  area: string;
  address: string;
  currentCurriculum: string;
  studentStrength: string;
  branches: string;
  source: string;
  referenceName: string;
  interests: string[];
  remarks: string;
  status: string;
  temperature: string;
  assignedToId: string;
  nextFollowUpDate: string;
  followUpType: string;
  followUpRemark: string;
};

const TYPE_CITY = "__type__";

export function LeadForm({
  value,
  onChange,
  products,
  team,
  cities,
  idPrefix = "lf",
}: {
  value: LeadValues;
  onChange: (v: LeadValues) => void;
  products: ProductOption[];
  team: Option[];
  cities: Record<string, string[]>;
  idPrefix?: string;
}) {
  const set = <K extends keyof LeadValues>(k: K, v: LeadValues[K]) => onChange({ ...value, [k]: v });
  const id = (k: string) => `${idPrefix}-${k}`;
  const stateCities = cities[value.state] ?? [];
  const cityListed = stateCities.includes(value.city);
  const [typing, setTyping] = useState(!cityListed && (value.city !== "" || stateCities.length === 0));
  const showTyped = typing || stateCities.length === 0;

  // Keep inactive products visible only if already chosen.
  const shownProducts = products.filter((p) => p.active || value.interests.includes(p.id));

  return (
    <>
      <h3>Basic information</h3>
      <div className="fg2 mt-2">
        <Field label="School name *" htmlFor={id("school")}>
          <input className="in" id={id("school")} value={value.schoolName} onChange={(e) => set("schoolName", e.target.value)} />
        </Field>
        <Field label="Owner / contact person *" htmlFor={id("owner")}>
          <input className="in" id={id("owner")} value={value.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Designation" htmlFor={id("desig")}>
          <select className="sel" id={id("desig")} value={value.designation} onChange={(e) => set("designation", e.target.value)}>
            <Options list={DESIGNATIONS} blank="Not specified" />
          </select>
        </Field>
        <Field label="Mobile number *" htmlFor={id("mob")}>
          <input className="in" id={id("mob")} inputMode="tel" placeholder="98xxx xxxxx" value={value.mobile} onChange={(e) => set("mobile", e.target.value)} />
        </Field>
        <Field label="Email ID" htmlFor={id("email")}>
          <input className="in" id={id("email")} type="email" placeholder="owner@example.com" value={value.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="State *" htmlFor={id("state")}>
          <select
            className="sel"
            id={id("state")}
            value={value.state}
            onChange={(e) => {
              const st = e.target.value;
              onChange({ ...value, state: st, city: "" });
              setTyping((cities[st] ?? []).length === 0);
            }}
          >
            <Options list={STATES} />
          </select>
        </Field>
        <Field label="City *" htmlFor={id("city")}>
          {showTyped ? (
            <div className="flex gap-2">
              <input className="in" id={id("city")} placeholder="City name" value={value.city} onChange={(e) => set("city", e.target.value)} />
              {stateCities.length ? (
                <button type="button" className="btn sm" onClick={() => (setTyping(false), set("city", ""))}>
                  List
                </button>
              ) : null}
            </div>
          ) : (
            <select
              className="sel"
              id={id("city")}
              value={value.city}
              onChange={(e) => {
                if (e.target.value === TYPE_CITY) {
                  setTyping(true);
                  set("city", "");
                } else set("city", e.target.value);
              }}
            >
              <option value="">Choose a city</option>
              <Options list={stateCities} />
              <option value={TYPE_CITY}>Other – type a city…</option>
            </select>
          )}
        </Field>
        <Field label="Area / location" htmlFor={id("area")}>
          <input className="in" id={id("area")} placeholder="e.g. Baner" value={value.area} onChange={(e) => set("area", e.target.value)} />
        </Field>
      </div>
      <Field label="Address" htmlFor={id("addr")}>
        <textarea className="ta" id={id("addr")} placeholder="Complete school address" value={value.address} onChange={(e) => set("address", e.target.value)} />
      </Field>

      <h3 className="mt-4">School details</h3>
      <div className="fg2 mt-2">
        <Field label="Current publication / curriculum" htmlFor={id("curr")}>
          <select className="sel" id={id("curr")} value={value.currentCurriculum} onChange={(e) => set("currentCurriculum", e.target.value)}>
            <Options list={PUBLICATIONS} blank="Not specified" />
          </select>
        </Field>
        <Field label="Current student strength" htmlFor={id("strength")}>
          <input className="in" id={id("strength")} type="number" min={0} value={value.studentStrength} onChange={(e) => set("studentStrength", e.target.value)} />
        </Field>
        <Field label="Number of branches" htmlFor={id("branches")}>
          <input
            className="in"
            id={id("branches")}
            type="number"
            min={1}
            placeholder="Leave blank if single school"
            value={value.branches}
            onChange={(e) => set("branches", e.target.value)}
          />
        </Field>
      </div>

      <h3 className="mt-4">Lead</h3>
      <div className="fg2 mt-2">
        <Field label="Lead source *" htmlFor={id("src")}>
          <select className="sel" id={id("src")} value={value.source} onChange={(e) => set("source", e.target.value)}>
            <Options list={SOURCES} blank="Choose a source" />
          </select>
        </Field>
        {REF_SOURCES.includes(value.source) ? (
          <Field label="Reference name" htmlFor={id("ref")}>
            <input className="in" id={id("ref")} placeholder="Who referred them" value={value.referenceName} onChange={(e) => set("referenceName", e.target.value)} />
          </Field>
        ) : null}
      </div>
      <Field label="Interested in">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Interested in">
          {shownProducts.map((p) => {
            const on = value.interests.includes(p.id);
            return (
              <button
                type="button"
                key={p.id}
                className={`chip ${on ? "on" : ""}`}
                aria-pressed={on}
                onClick={() => set("interests", on ? value.interests.filter((x) => x !== p.id) : [...value.interests, p.id])}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Remarks / notes" htmlFor={id("rem")}>
        <textarea className="ta" id={id("rem")} value={value.remarks} onChange={(e) => set("remarks", e.target.value)} />
      </Field>

      <h3 className="mt-4">CRM control</h3>
      <div className="fg2 mt-2">
        <Field label="Lead status" htmlFor={id("status")}>
          <select className="sel" id={id("status")} value={value.status} onChange={(e) => set("status", e.target.value)}>
            <Options list={MANUAL_LEAD_STATUSES.map((s) => [s, LEAD_STATUS_LABEL[s]] as const)} />
          </select>
        </Field>
        <Field label="Temperature" htmlFor={id("temp")}>
          <select className="sel" id={id("temp")} value={value.temperature} onChange={(e) => set("temperature", e.target.value)}>
            <Options list={Object.entries(TEMPERATURE_LABEL) as [string, string][]} />
          </select>
        </Field>
        <Field label="Assigned to *" htmlFor={id("by")}>
          <select className="sel" id={id("by")} value={value.assignedToId} disabled={team.length === 1} onChange={(e) => set("assignedToId", e.target.value)}>
            {team.length > 1 ? <option value="">Choose a person</option> : null}
            <Options list={team.map((t) => [t.id, t.name] as const)} />
          </select>
        </Field>
      </div>

      <h3 className="mt-4">Follow-up</h3>
      <div className="fg2 mt-2">
        <Field label="Next follow-up date *" htmlFor={id("fu")}>
          <input className="in" type="date" id={id("fu")} value={value.nextFollowUpDate} onChange={(e) => set("nextFollowUpDate", e.target.value)} />
        </Field>
        <Field label="Follow-up type" htmlFor={id("ftype")}>
          <select className="sel" id={id("ftype")} value={value.followUpType} onChange={(e) => set("followUpType", e.target.value)}>
            <Options list={FOLLOWUP_TYPES} blank="Not specified" />
          </select>
        </Field>
      </div>
      <Field label="Follow-up remark" htmlFor={id("frem")}>
        <textarea
          className="ta"
          id={id("frem")}
          placeholder="Instruction or note for the next follow-up"
          value={value.followUpRemark}
          onChange={(e) => set("followUpRemark", e.target.value)}
        />
      </Field>
    </>
  );
}
