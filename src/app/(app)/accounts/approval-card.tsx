"use client";

import Link from "next/link";
import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { Card, Empty, Pill } from "@/components/ui";
import { approvePayment, rejectPayment } from "@/app/actions";
import { inrExact as money } from "@/lib/format";
import type { ApprovalRow } from "@/server/finance/service";
import { SendReceipt, type ReceiptInfo } from "../clients/[id]/finance";

const dmy = (d: string) => d.split("-").reverse().join("/");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "4 Oct, 3:05 PM" in India time, the same on the server and in the browser. */
function when(iso: string) {
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600e3);
  const h = d.getUTCHours();
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

type Open = { r: ReceiptInfo; school: string; mobile: string; email: string | null };

/** Both lists of the Accounts page. The receipt window lives here, so it stays open when an approved card moves to "Decided". */
export function ApprovalLists({
  waiting,
  decided,
  emailReady,
  me,
}: {
  waiting: ApprovalRow[];
  decided: ApprovalRow[];
  emailReady: boolean;
  me: { name: string };
}) {
  const [open, setOpen] = useState<Open | null>(null);
  const card = (p: ApprovalRow) => (
    <ApprovalCard key={p.id} p={p} onReceipt={(r) => setOpen({ r, school: p.client.schoolName, mobile: p.client.mobile, email: p.client.email })} />
  );
  return (
    <>
      <Card title={`Waiting for approval (${waiting.length})`}>
        {waiting.length ? (
          <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">{waiting.map(card)}</div>
        ) : (
          <Empty>Nothing waiting. New payments recorded by the team appear here.</Empty>
        )}
      </Card>
      <div className="mt-4">
        <Card title="Decided in the last 30 days">
          {decided.length ? <div className="grid grid-cols-1 gap-2.5 min-[1101px]:grid-cols-2">{decided.map(card)}</div> : <Empty>No decisions yet.</Empty>}
        </Card>
      </div>
      {open ? (
        <SendReceipt r={open.r} contact={{ schoolName: open.school, mobile: open.mobile, email: open.email }} emailReady={emailReady} me={me} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}

/** One payment on the Accounts page: details, Approve / Reject, and the receipt once approved. */
function ApprovalCard({ p, onReceipt }: { p: ApprovalRow; onReceipt: (r: ReceiptInfo) => void }) {
  const { pending, run } = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const info: ReceiptInfo | null = p.number ? { paymentId: p.id, number: p.number, shareToken: p.shareToken, amount: p.amount, against: p.against.toLowerCase() } : null;
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <b className={`text-[17px] ${p.approval === "REJECTED" ? "text-coral line-through" : ""}`}>{money(p.amount)}</b>{" "}
          {p.approval === "PENDING" ? <Pill tone="warn">Waiting</Pill> : p.approval === "APPROVED" ? <Pill tone="ok">Approved</Pill> : <Pill tone="bad">Rejected</Pill>}
          <div className="mt-0.5">
            <Link href={`/clients/${p.client.id}?tab=money`} className="font-semibold">
              {p.client.schoolName}
            </Link>
            <span className="small muted"> · {p.client.city}</span>
          </div>
        </div>
        {p.number ? <span className="tag whitespace-nowrap">Receipt {p.number}</span> : null}
      </div>
      <div className="small muted mt-1">
        {p.against} · paid {dmy(p.date)} · {p.mode}
        {p.reference ? ` · ${p.reference}` : ""}
        {p.bank ? ` · ${p.bank}` : ""}
        {p.chequeDate ? ` · cheque dated ${dmy(p.chequeDate)}` : ""}
      </div>
      <div className="small muted">
        Recorded by {p.recordedBy} on {when(p.recordedAt)} · salesperson {p.client.owner.name}
      </div>
      {p.note ? <div className="small mt-0.5">“{p.note}”</div> : null}
      {p.decidedBy && p.decidedAt ? (
        <div className="small mt-0.5">
          {p.approval === "APPROVED" ? "Approved" : "Rejected"} by {p.decidedBy} on {when(p.decidedAt)}
          {p.rejectReason ? <span className="text-coral"> · {p.rejectReason}</span> : null}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.approval === "PENDING" ? (
          <>
            <button
              className="btn sm pri"
              disabled={pending}
              onClick={() =>
                run(() => approvePayment(p.id), {
                  success: "Approved. It now counts as received; the receipt can be sent.",
                  onDone: (r) => r && onReceipt({ paymentId: r.paymentId, number: r.receiptNumber, shareToken: r.shareToken, amount: r.amount, against: r.against }),
                })
              }
            >
              <Icon name="check" size={14} /> Approve
            </button>
            <button className="btn sm bad" disabled={pending} onClick={() => setRejecting(true)}>
              Reject
            </button>
          </>
        ) : null}
        {p.approval === "APPROVED" && info ? (
          <button className="btn sm" onClick={() => onReceipt(info)}>
            Send receipt
          </button>
        ) : null}
      </div>
      {rejecting ? (
        <Modal
          title={`Reject ${money(p.amount)}?`}
          sub={`${p.client.schoolName} · ${p.against}. It won't count as received and ${p.recordedBy} gets a to-do with your reason.`}
          onClose={() => setRejecting(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRejecting(false)}>
                Cancel
              </button>
              <button className="btn bad" disabled={pending} onClick={() => run(() => rejectPayment(p.id, { reason }), { success: "Rejected. The person who recorded it has been told.", onDone: () => setRejecting(false) })}>
                {pending ? "Saving…" : "Reject payment"}
              </button>
            </>
          }
        >
          <Field label="Reason *" htmlFor={`rj-${p.id}`}>
            <textarea className="ta" id={`rj-${p.id}`} rows={3} placeholder="e.g. Amount not received in the bank; UTR doesn't match" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        </Modal>
      ) : null}
    </div>
  );
}
