"use client";

import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { handOverWork, openWorkOf } from "@/app/actions";
import type { Option } from "@/server/queries";

type Counts = { leads: number; opportunities: number; clients: number; tasks: number };

/** Moves a person's open leads, deals, clients and to-dos to a colleague. */
export function HandOverButton({ user, team }: { user: { id: string; name: string }; team: Option[] }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [to, setTo] = useState("");
  const { pending, run } = useAction();
  const close = () => {
    setCounts(null);
    setTo("");
  };
  const others = team.filter((t) => t.id !== user.id);
  const total = counts ? counts.leads + counts.opportunities + counts.clients + counts.tasks : 0;
  return (
    <>
      <button className="btn sm" disabled={pending} onClick={() => run(() => openWorkOf(user.id), { onDone: (c) => c && setCounts(c) })}>
        Hand over work
      </button>
      {counts ? (
        <Modal
          title={`Hand over ${user.name}'s work`}
          sub="Use this when someone leaves or changes territory."
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending || !to || !total}
                onClick={() =>
                  run(() => handOverWork(user.id, to), {
                    success: `Handed over to ${others.find((o) => o.id === to)?.name}.`,
                    onDone: close,
                  })
                }
              >
                Hand over
              </button>
            </>
          }
        >
          {total ? (
            <ul className="mb-3 ml-5 list-disc">
              <li>{counts.leads} open lead(s)</li>
              <li>{counts.opportunities} open opportunit{counts.opportunities === 1 ? "y" : "ies"}</li>
              <li>{counts.clients} client(s), with their payment follow-ups</li>
              <li>{counts.tasks} open to-do(s)</li>
            </ul>
          ) : (
            <p className="mb-3">{user.name} has nothing open to hand over.</p>
          )}
          <Field label="Give all of this to" htmlFor="ho-to">
            <select className="sel" id="ho-to" value={to} onChange={(e) => setTo(e.target.value)}>
              <Options list={others.map((o) => [o.id, o.name] as const)} blank="Choose a person" />
            </select>
          </Field>
          <p className="small muted">Closed records (won/lost deals, converted leads) keep their history. Deactivate the user afterwards so they can no longer sign in.</p>
        </Modal>
      ) : null}
    </>
  );
}
