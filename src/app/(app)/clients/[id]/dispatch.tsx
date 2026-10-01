"use client";

// Dispatch on a sales order: send kits in lots, print the delivery challan,
// mark received and keep the school's signed proof of delivery.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";
import { createDispatch, deleteDispatch, markDispatchReceived } from "@/app/actions";
import { todayIST } from "@/lib/dates";
import { dmy } from "@/lib/format";
import type { ClientDetail } from "@/server/queries";

type SO = ClientDetail["salesOrders"][number];

/** Uploads a file to the client's file store (documents, proof of delivery). */
export async function uploadClientFile(clientId: string, file: File, fields: Record<string, string>) {
  const body = new FormData();
  body.append("file", file);
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  try {
    const r = await fetch(`/api/clients/${clientId}/files`, { method: "POST", body });
    return (await r.json()) as { ok: true } | { ok: false; error: string };
  } catch {
    return { ok: false as const, error: "The upload failed. Check your internet connection and try again." };
  }
}

export function DispatchSection({ so, clientId }: { so: SO; clientId: string }) {
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState<SO["dispatches"][number] | null>(null);
  const { pending, run } = useAction();
  const ordered = so.items.reduce((t, i) => t + i.qty, 0);
  const sent = so.items.reduce((t, i) => t + i.sent, 0);
  const left = ordered - sent;
  if (so.status === "CANCELLED" && !so.dispatches.length) return null;
  return (
    <div className="mt-2 rounded-lg bg-surf2 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="small">
          <b>Dispatch:</b> {sent} of {ordered} kits sent{left > 0 ? ` · ${left} to go` : " · all sent"}
        </span>
        {left > 0 && so.status !== "CANCELLED" ? (
          <button className="btn sm" onClick={() => setSending(true)}>
            <Icon name="briefcase" size={14} /> Dispatch kits
          </button>
        ) : null}
      </div>
      {so.dispatches.map((d) => (
        <div key={d.id} className="small mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-1.5">
          <b>{d.number}</b>
          <span className="muted">
            {dmy(d.date)} · {d.kits} kits{d.transporter ? ` · ${d.transporter}` : ""}
            {d.docketNo ? ` ${d.docketNo}` : ""}
          </span>
          {d.receivedOn ? <Pill tone="ok">{`Received ${dmy(d.receivedOn)}`}</Pill> : <Pill tone="warn">In transit</Pill>}
          <span className="flex flex-wrap gap-1.5">
            <a className="btn sm" href={`/api/dispatches/${d.id}/challan`} target="_blank" rel="noreferrer">
              Challan PDF
            </a>
            {d.pod ? (
              <a className="btn sm" href={`/api/files/${d.pod.id}`} target="_blank" rel="noreferrer">
                Proof of delivery
              </a>
            ) : null}
            {!d.receivedOn || !d.pod ? (
              <button className="btn sm" onClick={() => setReceiving(d)}>
                {d.receivedOn ? "Upload proof" : "Mark received"}
              </button>
            ) : null}
            {!d.receivedOn ? (
              <button
                className="btn sm ghost"
                disabled={pending}
                onClick={() => confirm(`Delete challan ${d.number}? Use this only if it was entered by mistake.`) && run(() => deleteDispatch(d.id), { success: "Challan deleted." })}
              >
                Delete
              </button>
            ) : null}
          </span>
        </div>
      ))}
      {sending ? <DispatchModal so={so} onClose={() => setSending(false)} /> : null}
      {receiving ? <ReceivedModal d={receiving} clientId={clientId} onClose={() => setReceiving(null)} /> : null}
    </div>
  );
}

function DispatchModal({ so, onClose }: { so: SO; onClose: () => void }) {
  const [v, setV] = useState({ date: todayIST(), transporter: "", docketNo: "", vehicleNo: "", notes: "" });
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(so.items.map((i) => [i.id, String(i.qty - i.sent)])));
  const { pending, run } = useAction();
  return (
    <Modal
      title={`Dispatch kits · ${so.number}`}
      sub="Enter how many kits go in this lot. A delivery challan is made for it."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(() => createDispatch(so.id, { ...v, lines: so.items.map((i) => ({ itemId: i.id, qty: qty[i.id] || 0 })) }), {
                success: "Dispatched. Print the challan to send with the kits.",
                onDone: (id) => {
                  onClose();
                  if (id) window.open(`/api/dispatches/${id}/challan`, "_blank");
                },
              })
            }
          >
            {pending ? "Saving…" : "Dispatch & print challan"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {so.items.map((i) => (
          <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2">
            <label className="min-w-0" htmlFor={`dq-${i.id}`}>
              {i.description}
              <span className="small faint block">
                {i.sent} of {i.qty} sent
              </span>
            </label>
            <input
              className="in text-right"
              id={`dq-${i.id}`}
              inputMode="numeric"
              disabled={i.qty - i.sent <= 0}
              value={qty[i.id]}
              onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="Dispatch date" htmlFor="dc-date">
          <DateInput id="dc-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
        </Field>
        <Field label="Transporter / courier" htmlFor="dc-tr">
          <input className="in" id="dc-tr" placeholder="e.g. VRL Logistics" value={v.transporter} onChange={(e) => setV({ ...v, transporter: e.target.value })} />
        </Field>
        <Field label="Docket / LR number" htmlFor="dc-dk">
          <input className="in" id="dc-dk" value={v.docketNo} onChange={(e) => setV({ ...v, docketNo: e.target.value })} />
        </Field>
        <Field label="Vehicle number" htmlFor="dc-vh">
          <input className="in" id="dc-vh" placeholder="Optional" value={v.vehicleNo} onChange={(e) => setV({ ...v, vehicleNo: e.target.value })} />
        </Field>
      </div>
      <Field label="Note" htmlFor="dc-note">
        <input className="in" id="dc-note" placeholder="Optional" value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
    </Modal>
  );
}

function ReceivedModal({ d, clientId, onClose }: { d: SO["dispatches"][number]; clientId: string; onClose: () => void }) {
  const [date, setDate] = useState(d.receivedOn ?? todayIST());
  const [file, setFile] = useState<File | null>(null);
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <Modal
      title={`Received · ${d.number}`}
      sub="When the school confirms the kits arrived. Attach the signed challan or a photo as proof."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(
                async () => {
                  const r = await markDispatchReceived(d.id, date);
                  if (!r.ok || !file) return r;
                  return uploadClientFile(clientId, file, { dispatchId: d.id, category: "Proof of delivery", title: `Proof of delivery ${d.number}` });
                },
                {
                  success: "Saved.",
                  onDone: () => {
                    onClose();
                    router.refresh();
                  },
                },
              )
            }
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Received on" htmlFor="rc-date">
        <DateInput id="rc-date" value={date} onChange={setDate} />
      </Field>
      <Field label="Proof of delivery (PDF or photo, up to 4 MB)" htmlFor="rc-file">
        <input className="in" id="rc-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>
    </Modal>
  );
}
