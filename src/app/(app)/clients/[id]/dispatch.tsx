"use client";

// Dispatch on a sales order: send kits in lots, print the delivery challan,
// mark received and keep the school's signed proof of delivery.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";
import { SendDocButton } from "@/components/send-doc";
import { closeMaterialIssue, createDispatch, deleteDispatch, makeProductionOrder, markDispatchReceived, materialStockChoices, refundMaterialIssue, reportMaterialIssue, sendMaterialReplacement } from "@/app/actions";
import { useApp } from "@/components/app-context";
import { todayIST } from "@/lib/dates";
import { dmy } from "@/lib/format";
import type { ClientDetail } from "@/server/queries";

type SO = ClientDetail["salesOrders"][number];
type Issue = SO["issues"][number];

const ISSUE_KIND: Record<Issue["kind"], string> = { SHORT: "Short", DAMAGED: "Damaged / wrong", RETURNED: "Returned" };
const ISSUE_STATUS: Record<Issue["status"], string> = { OPEN: "Open", REPLACED: "Replaced", REFUNDED: "Refunded", CLOSED: "Closed" };

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

export function DispatchSection({
  so,
  clientId,
  share,
}: {
  so: SO;
  clientId: string;
  share: { schoolName: string; mobile: string | null; me: { name: string } };
}) {
  const [sending, setSending] = useState(false);
  const [receiving, setReceiving] = useState<SO["dispatches"][number] | null>(null);
  const [reporting, setReporting] = useState<string | null | false>(false);
  const [settling, setSettling] = useState<{ issue: Issue; how: "replace" | "refund" | "close" } | null>(null);
  const { canFinance, seesAll, features } = useApp();
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
          {so.production ? (
            <>
              {" · "}
              <a href="/inventory?tab=production&pshow=all">
                Production {so.production.number}: {{ PLANNED: "to start", IN_PRODUCTION: "in production", READY: "ready", CANCELLED: "cancelled" }[so.production.status] ?? so.production.status}
              </a>
            </>
          ) : null}
        </span>
        <span className="flex flex-wrap gap-1.5">
          {features.inventory && !so.production && so.status === "CONFIRMED" && seesAll ? (
            <button className="btn sm" disabled={pending} onClick={() => run(() => makeProductionOrder(so.id), { success: "Production order made." })}>
              Make production order
            </button>
          ) : null}
          {so.dispatches.length ? (
            <button className="btn sm" onClick={() => setReporting(null)}>
              Report problem
            </button>
          ) : null}
          {left > 0 && so.status !== "CANCELLED" ? (
            <button className="btn sm" onClick={() => setSending(true)}>
              <Icon name="briefcase" size={14} /> Dispatch kits
            </button>
          ) : null}
        </span>
      </div>
      {so.dispatches.map((d) => (
        <div key={d.id} className="small mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-1.5">
          <b>{d.number}</b>
          {d.isReplacement ? <Pill tone="grape">Replacement</Pill> : null}
          <span className="muted">
            {dmy(d.date)} · {d.kits} kits{d.transporter ? ` · ${d.transporter}` : ""}
            {d.docketNo ? ` ${d.docketNo}` : ""}
          </span>
          {d.receivedOn ? <Pill tone="ok">{`Received ${dmy(d.receivedOn)}`}</Pill> : <Pill tone="warn">In transit</Pill>}
          <span className="flex flex-wrap gap-1.5">
            <a className="btn sm" href={`/api/dispatches/${d.id}/challan`} target="_blank" rel="noreferrer">
              Challan PDF
            </a>
            <SendDocButton
              kind="challan"
              id={d.id}
              pdf={`/api/dispatches/${d.id}/challan`}
              title={`Challan ${d.number}`}
              schoolName={share.schoolName}
              mobile={share.mobile}
              body={`Your kits are on the way: delivery challan ${d.number} for ${d.kits} kits (order ${so.number})${d.transporter ? `, sent by ${d.transporter}${d.docketNo ? ` (docket ${d.docketNo})` : ""}` : ""}.`}
              me={share.me}
            />
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
            {!d.isReplacement ? (
              <button className="btn sm ghost" onClick={() => setReporting(d.id)}>
                Problem?
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
      {so.issues.length ? (
        <div className="mt-2 border-t border-line pt-1.5">
          <div className="small font-semibold">Material problems</div>
          {so.issues.map((m) => (
            <div key={m.id} className="small mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Pill tone={m.status === "OPEN" ? "bad" : m.status === "CLOSED" ? "mute" : "ok"}>{ISSUE_STATUS[m.status]}</Pill>
              <span className="min-w-0">
                <b>{ISSUE_KIND[m.kind]}</b> · {m.qty} × {m.item}
                {m.detail ? ` · ${m.detail}` : ""}
                <span className="muted">
                  {" "}
                  · {dmy(m.date)}
                  {m.challan ? ` · ${m.challan}` : ""}
                  {m.backTo ? ` · back in store as ${m.backTo === "GOOD" ? "good" : "damaged"} stock` : ""}
                  {m.replacement ? ` · replaced by ${m.replacement.number}` : ""}
                  {m.creditNote ? ` · credit note ${m.creditNote}` : ""}
                  {m.refundAmount !== null && !m.creditNote ? ` · ₹${m.refundAmount.toLocaleString("en-IN")} paid back` : ""}
                  {m.resolvedNote ? ` · ${m.resolvedNote}` : ""}
                </span>
              </span>
              {m.status === "OPEN" ? (
                <span className="flex flex-wrap gap-1.5">
                  <button className="btn sm" onClick={() => setSettling({ issue: m, how: "replace" })}>
                    Send replacement
                  </button>
                  {canFinance ? (
                    <button className="btn sm" onClick={() => setSettling({ issue: m, how: "refund" })}>
                      Refund / adjust
                    </button>
                  ) : null}
                  <button className="btn sm ghost" onClick={() => setSettling({ issue: m, how: "close" })}>
                    Close
                  </button>
                </span>
              ) : null}
            </div>
          ))}
          {!canFinance && so.issues.some((m) => m.status === "OPEN") ? (
            <div className="small faint mt-1">Refunds and money adjustments are done by an Admin or the Sales Head.</div>
          ) : null}
        </div>
      ) : null}
      {sending ? <DispatchModal so={so} onClose={() => setSending(false)} /> : null}
      {reporting !== false ? <IssueModal so={so} dispatchId={reporting} onClose={() => setReporting(false)} /> : null}
      {settling ? <SettleModal so={so} issue={settling.issue} how={settling.how} onClose={() => setSettling(null)} /> : null}
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
                  // Phones block pop-ups opened after a wait, so fall back to opening it here.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a PDF file, not a page
                  if (id && !window.open(`/api/dispatches/${id}/challan`, "_blank")) (window.location.href = `/api/dispatches/${id}/challan`);
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

/** R53: report kits that arrived short, damaged or wrong, or that the school sent back. */
function IssueModal({ so, dispatchId, onClose }: { so: SO; dispatchId: string | null; onClose: () => void }) {
  const [v, setV] = useState({
    kind: "SHORT" as Issue["kind"],
    itemId: so.items[0]?.id ?? "",
    qty: "",
    detail: "",
    date: todayIST(),
    dispatchId: dispatchId ?? so.dispatches.filter((d) => !d.isReplacement).at(-1)?.id ?? "",
    backTo: "" as "" | "GOOD" | "DAMAGED",
    stockItemId: "",
  });
  const { pending, run } = useAction();
  const { features } = useApp();
  const choices = useStockChoices(features.inventory ? v.itemId : "");
  return (
    <Modal
      title={`Material problem · ${so.number}`}
      sub="Kits that arrived short, damaged or wrong, or that the school sent back. Settle it afterwards by a replacement or a refund."
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() => run(() => reportMaterialIssue(so.id, { ...v, backTo: v.kind === "SHORT" ? null : v.backTo || null, stockItemId: v.stockItemId || null }), { success: "Problem recorded.", onDone: onClose })}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="fld">
        <label>What happened</label>
        <div className="chips">
          {(Object.keys(ISSUE_KIND) as Issue["kind"][]).map((k) => (
            <button key={k} type="button" className={`chip ${v.kind === k ? "on" : ""}`} aria-pressed={v.kind === k} onClick={() => setV({ ...v, kind: k })}>
              {k === "SHORT" ? "Short (not received)" : k === "DAMAGED" ? "Damaged or wrong" : "Returned by school"}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-[minmax(0,1fr)_110px]">
        <Field label="Order line" htmlFor="mi-item">
          <select className="sel" id="mi-item" value={v.itemId} onChange={(e) => setV({ ...v, itemId: e.target.value })}>
            {so.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.description}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kits affected" htmlFor="mi-qty">
          <input className="in text-right" id="mi-qty" inputMode="numeric" value={v.qty} onChange={(e) => setV({ ...v, qty: e.target.value })} />
        </Field>
      </div>
      <Field label="What exactly" htmlFor="mi-detail">
        <input className="in" id="mi-detail" placeholder="e.g. Bags missing, Book 3 torn, wrong class kit" value={v.detail} onChange={(e) => setV({ ...v, detail: e.target.value })} />
      </Field>
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="Date" htmlFor="mi-date">
          <DateInput id="mi-date" value={v.date} onChange={(date) => setV({ ...v, date })} />
        </Field>
        <Field label="Challan" htmlFor="mi-dc">
          <select className="sel" id="mi-dc" value={v.dispatchId} onChange={(e) => setV({ ...v, dispatchId: e.target.value })}>
            <option value="">Not sure</option>
            {so.dispatches
              .filter((d) => !d.isReplacement)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.number} · {dmy(d.date)}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {features.inventory && v.kind !== "SHORT" ? (
        <div className="mt-1 rounded-lg border border-line p-3">
          <div className="fld mb-2">
            <label>Did it come back to our store?</label>
            <div className="chips">
              {(
                [
                  ["", "No"],
                  ["GOOD", "Yes, as good stock"],
                  ["DAMAGED", "Yes, as damaged stock"],
                ] as const
              ).map(([k, l]) => (
                <button key={l} type="button" className={`chip ${v.backTo === k ? "on" : ""}`} aria-pressed={v.backTo === k} onClick={() => setV({ ...v, backTo: k })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {v.backTo && choices.length > 1 ? (
            <Field label="What came back" htmlFor="mi-stock">
              <select className="sel" id="mi-stock" value={v.stockItemId} onChange={(e) => setV({ ...v, stockItemId: e.target.value })}>
                {choices.map((c, i) => (
                  <option key={c.id} value={i === 0 ? "" : c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

/** R54: the kit and its items, for choosing what leaves or comes back to the store. */
function useStockChoices(itemId: string) {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let live = true;
    if (!itemId) return;
    materialStockChoices(itemId)
      .then((x) => live && setList(x))
      .catch(() => live && setList([]));
    return () => {
      live = false;
    };
  }, [itemId]);
  return itemId ? list : [];
}

/** R53: settle a material problem: send a replacement, refund / adjust the money, or close it. */
function SettleModal({ so, issue, how, onClose }: { so: SO; issue: Issue; how: "replace" | "refund" | "close"; onClose: () => void }) {
  const [rep, setRep] = useState({ date: todayIST(), transporter: "", docketNo: "", vehicleNo: "", stockItemId: "" });
  const { features } = useApp();
  const choices = useStockChoices(features.inventory && how === "replace" ? issue.itemId : "");
  const [ref, setRef] = useState({ how: so.invoice ? "credit" : "paid", amount: String(Math.round(issue.unit * issue.qty * 100) / 100), date: todayIST(), note: "" });
  const [note, setNote] = useState("");
  const { pending, run } = useAction();
  const what = `${issue.qty} × ${issue.item}${issue.detail ? ` (${issue.detail})` : ""}`;
  const save = () =>
    how === "replace"
      ? run(() => sendMaterialReplacement(issue.id, { ...rep, stockItemId: rep.stockItemId || null }), {
          success: "Replacement challan made. Print it to send with the items.",
          onDone: (id) => {
            onClose();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a PDF file, not a page
            if (id && !window.open(`/api/dispatches/${id}/challan`, "_blank")) (window.location.href = `/api/dispatches/${id}/challan`);
          },
        })
      : how === "refund"
        ? run(() => refundMaterialIssue(issue.id, ref), { success: "Money adjusted.", onDone: onClose })
        : run(() => closeMaterialIssue(issue.id, note), { success: "Closed.", onDone: onClose });
  return (
    <Modal
      title={how === "replace" ? "Send replacement" : how === "refund" ? "Refund / adjust money" : "Close problem"}
      sub={what}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : how === "replace" ? "Make replacement challan" : how === "refund" ? "Save" : "Close problem"}
          </button>
        </>
      }
    >
      {how === "replace" ? (
        <>
          <p className="small muted mb-3">A replacement challan is made for these items. It doesn&apos;t count against the order&apos;s kits.</p>
          {choices.length > 1 ? (
            <Field label="What leaves the store" htmlFor="rp-stock">
              <select className="sel" id="rp-stock" value={rep.stockItemId} onChange={(e) => setRep({ ...rep, stockItemId: e.target.value })}>
                {choices.map((c, i) => (
                  <option key={c.id} value={i === 0 ? "" : c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
            <Field label="Dispatch date" htmlFor="rp-date">
              <DateInput id="rp-date" value={rep.date} onChange={(date) => setRep({ ...rep, date })} />
            </Field>
            <Field label="Transporter / courier" htmlFor="rp-tr">
              <input className="in" id="rp-tr" value={rep.transporter} onChange={(e) => setRep({ ...rep, transporter: e.target.value })} />
            </Field>
            <Field label="Docket / LR number" htmlFor="rp-dk">
              <input className="in" id="rp-dk" value={rep.docketNo} onChange={(e) => setRep({ ...rep, docketNo: e.target.value })} />
            </Field>
            <Field label="Vehicle number" htmlFor="rp-vh">
              <input className="in" id="rp-vh" placeholder="Optional" value={rep.vehicleNo} onChange={(e) => setRep({ ...rep, vehicleNo: e.target.value })} />
            </Field>
          </div>
        </>
      ) : how === "refund" ? (
        <>
          <div className="fld">
            <label>How</label>
            <div className="chips">
              <button type="button" className={`chip ${ref.how === "credit" ? "on" : ""}`} aria-pressed={ref.how === "credit"} disabled={!so.invoice} onClick={() => setRef({ ...ref, how: "credit" })}>
                Lower the invoice (credit note)
              </button>
              <button type="button" className={`chip ${ref.how === "paid" ? "on" : ""}`} aria-pressed={ref.how === "paid"} onClick={() => setRef({ ...ref, how: "paid" })}>
                Money paid back
              </button>
            </div>
            {!so.invoice ? <span className="small faint">No invoice on this order yet, so a credit note isn&apos;t possible.</span> : null}
          </div>
          <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
            <Field label="Amount (₹)" htmlFor="rf-amt">
              <input className="in text-right" id="rf-amt" inputMode="decimal" value={ref.amount} onChange={(e) => setRef({ ...ref, amount: e.target.value })} />
            </Field>
            <Field label="Date" htmlFor="rf-date">
              <DateInput id="rf-date" value={ref.date} onChange={(date) => setRef({ ...ref, date })} />
            </Field>
          </div>
          <Field label="Note" htmlFor="rf-note">
            <input className="in" id="rf-note" placeholder={ref.how === "paid" ? "e.g. NEFT ref. 1234" : "Optional"} value={ref.note} onChange={(e) => setRef({ ...ref, note: e.target.value })} />
          </Field>
        </>
      ) : (
        <Field label="Why is it closed?" htmlFor="cl-note">
          <input className="in" id="cl-note" placeholder="e.g. School kept the kits, found later" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}
