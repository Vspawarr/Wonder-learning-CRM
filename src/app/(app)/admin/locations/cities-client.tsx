"use client";

import { useState } from "react";
import { useAction } from "@/components/client";
import { addCity, addState, deleteCity, setCityActive, setStateActive } from "@/app/actions";

export function AddState() {
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  const submit = () => run(() => addState({ name }), { success: `${name.trim()} added.`, onDone: () => setName("") });
  return (
    <div className="flex flex-wrap items-end gap-2.5">
      <div className="fld mb-0 min-w-[200px] flex-1">
        <label htmlFor="s-name">New state</label>
        <input className="in" id="s-name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()} />
      </div>
      <button className="btn pri" disabled={pending || !name.trim()} onClick={submit}>
        Add state
      </button>
    </div>
  );
}

export function StateToggle({ id, name, active }: { id: string; name: string; active: boolean }) {
  const { pending, run } = useAction();
  return (
    <button
      className="btn sm"
      disabled={pending}
      onClick={() => run(() => setStateActive(id, !active), { success: active ? `${name} hidden.` : `${name} shown again.` })}
    >
      {active ? "Hide" : "Show"}
    </button>
  );
}

export function AddCity({ stateName }: { stateName: string }) {
  const [name, setName] = useState("");
  const { pending, run } = useAction();
  const fieldId = `c-${stateName.replace(/\W+/g, "-")}`;
  const submit = () => run(() => addCity({ stateName, name }), { success: `${name.trim()} added to ${stateName}.`, onDone: () => setName("") });
  return (
    <div className="flex gap-2">
      <input
        className="in"
        id={fieldId}
        aria-label={`New city in ${stateName}`}
        placeholder="Add a city"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()}
      />
      <button className="btn" disabled={pending || !name.trim()} onClick={submit}>
        Add
      </button>
    </div>
  );
}

export function CityChip({ id, name, active }: { id: string; name: string; active: boolean }) {
  const { pending, run } = useAction();
  return (
    <span className={`chip gap-0 p-0 ${active ? "" : "opacity-60"}`}>
      <button
        className={`min-h-[30px] px-2.5 ${active ? "" : "line-through"}`}
        disabled={pending}
        title={active ? "Click to hide from the lead form" : "Click to show on the lead form again"}
        onClick={() => run(() => setCityActive(id, !active), { success: active ? `${name} hidden.` : `${name} restored.` })}
      >
        {name}
      </button>
      <button
        className="min-h-[30px] border-l border-line px-2 text-coral"
        disabled={pending}
        aria-label={`Delete ${name}`}
        title={`Delete ${name}`}
        onClick={() =>
          confirm(`Delete ${name} from the list? Leads and clients already in ${name} keep it.`) && run(() => deleteCity(id), { success: `${name} deleted.` })
        }
      >
        ×
      </button>
    </span>
  );
}
