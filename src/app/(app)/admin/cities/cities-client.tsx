"use client";

import { useState } from "react";
import { Options, useAction } from "@/components/client";
import { addCity, setCityActive } from "@/app/actions";
import { STATES } from "@/lib/constants";

export function AddCity() {
  const [state, setState] = useState<string>(STATES[0]);
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  const submit = () => run(() => addCity({ stateName: state, name }), { success: `${name.trim()} added to ${state}.`, onDone: () => setName("") });
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div className="fld mb-0">
        <label htmlFor="c-state">State</label>
        <select className="sel" id="c-state" value={state} onChange={(e) => setState(e.target.value)}>
          <Options list={STATES} />
        </select>
      </div>
      <div className="fld mb-0 min-w-[200px] flex-1">
        <label htmlFor="c-name">City</label>
        <input
          className="in"
          id="c-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()}
        />
      </div>
      <button className="btn pri" disabled={pending || !name.trim()} onClick={submit}>
        Add city
      </button>
    </div>
  );
}

export function CityChip({ id, name, active }: { id: string; name: string; active: boolean }) {
  const { pending, run } = useAction();
  return (
    <button
      className={`chip ${active ? "" : "line-through opacity-60"}`}
      disabled={pending}
      title={active ? "Click to hide from the lead form" : "Click to show on the lead form again"}
      onClick={() => run(() => setCityActive(id, !active), { success: active ? `${name} hidden.` : `${name} restored.` })}
    >
      {name}
    </button>
  );
}
