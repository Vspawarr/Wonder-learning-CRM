"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";
import { decideTransfer } from "@/app/actions";
import { fmtDateTimeIST } from "@/lib/dates";
import type { TransferRow } from "@/server/transfers";

export function TransferCard({ t, approver }: { t: TransferRow; approver: boolean }) {
  const { pending, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={t.href} className="font-semibold">
            {t.school}
          </Link>{" "}
          {t.status === "PENDING" ? <Pill tone="warn">Waiting</Pill> : t.status === "APPROVED" ? <Pill tone="ok">Moved</Pill> : <Pill tone="bad">Rejected</Pill>}
          <div className="small muted">
            {t.kind} {t.code}
            {t.city ? ` · ${t.city}` : ""}
          </div>
        </div>
      </div>
      <div className="mt-1">
        <b>{t.from}</b> → <b>{t.to}</b>
      </div>
      {t.reason ? <div className="small mt-0.5">“{t.reason}”</div> : null}
      <div className="small muted">
        Asked by {t.requestedBy} on {fmtDateTimeIST(t.requestedAt)}
        {t.decidedBy && t.decidedAt ? ` · ${t.status === "APPROVED" ? "approved" : "rejected"} by ${t.decidedBy} on ${fmtDateTimeIST(t.decidedAt)}` : ""}
      </div>
      {t.rejectReason ? <div className="small text-coral">Rejected: {t.rejectReason}</div> : null}
      {approver && t.status === "PENDING" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button className="btn sm pri" disabled={pending} onClick={() => run(() => decideTransfer(t.id, { approve: true }), { success: `${t.school} moved to ${t.to}.` })}>
            <Icon name="check" size={14} /> Approve
          </button>
          <button className="btn sm bad" disabled={pending} onClick={() => setRejecting(true)}>
            Reject
          </button>
        </div>
      ) : null}
      {rejecting ? (
        <Modal
          title={`Reject transfer of ${t.school}?`}
          sub={`It stays with ${t.from}; ${t.requestedBy} gets a to-do with your reason.`}
          onClose={() => setRejecting(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRejecting(false)}>
                Cancel
              </button>
              <button className="btn bad" disabled={pending} onClick={() => run(() => decideTransfer(t.id, { approve: false, reason }), { success: "Rejected.", onDone: () => setRejecting(false) })}>
                Reject
              </button>
            </>
          }
        >
          <Field label="Reason *" htmlFor={`trj-${t.id}`}>
            <textarea className="ta" id={`trj-${t.id}`} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
