"use client";

// R43: "Transfer" on a lead or client page, and the waiting-request note.
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { cancelTransfer, requestTransfer } from "@/app/actions";
import type { TransferRow } from "@/server/transfers";

export function TransferButton({
  kind,
  id,
  school,
  ownerId,
  team,
  approver,
  pending,
}: {
  kind: "lead" | "client";
  id: string;
  school: string;
  ownerId: string;
  team: { id: string; name: string }[];
  /** Sales Head / Admin / Director: moves at once. */
  approver: boolean;
  pending: TransferRow | null;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ toUserId: "", reason: "" });
  const { pending: busy, run } = useAction();
  if (pending)
    return (
      <span className="note warn inline-flex flex-wrap items-center gap-2 py-1.5">
        <span className="small">
          Transfer to <b>{pending.to}</b> waiting for approval (asked by {pending.requestedBy})
        </span>
        <button className="btn sm ghost" disabled={busy} onClick={() => confirm("Withdraw this transfer request?") && run(() => cancelTransfer(pending.id), { success: "Request withdrawn." })}>
          Withdraw
        </button>
      </span>
    );
  const others = team.filter((t) => t.id !== ownerId);
  return (
    <>
      <button
        className="btn"
        onClick={() => {
          setV({ toUserId: "", reason: "" });
          setOpen(true);
        }}
      >
        <Icon name="users" size={16} /> Transfer
      </button>
      {open ? (
        <Modal
          title={`Transfer ${kind === "lead" ? "lead" : "client"}`}
          sub={
            approver
              ? `${school} moves to the chosen salesperson now, with its open ${kind === "lead" ? "deal and" : "renewal deals and"} to-dos.`
              : `${school} moves after the Sales Head or Admin approves. Its open ${kind === "lead" ? "deal and" : "renewal deals and"} to-dos move with it.`
          }
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={busy || !v.toUserId}
                onClick={() =>
                  run(() => requestTransfer({ kind, id, ...v }), {
                    success: approver ? "Transferred." : "Sent to the Sales Head / Admin for approval.",
                    onDone: () => setOpen(false),
                  })
                }
              >
                {approver ? "Transfer now" : "Ask for approval"}
              </button>
            </>
          }
        >
          <Field label="Transfer to *" htmlFor="tr-to">
            <select className="sel" id="tr-to" value={v.toUserId} onChange={(e) => setV({ ...v, toUserId: e.target.value })}>
              <Options list={others.map((t) => [t.id, t.name] as const)} blank="Choose salesperson…" />
            </select>
          </Field>
          <Field label={approver ? "Reason (optional)" : "Reason *"} htmlFor="tr-why">
            <textarea className="ta" id="tr-why" rows={3} placeholder="e.g. School is in Rohan's area" value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
          </Field>
        </Modal>
      ) : null}
    </>
  );
}
