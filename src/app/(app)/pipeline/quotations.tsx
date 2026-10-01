"use client";

import { useState } from "react";
import { Field, Modal, Options, useAction, useToast } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";
import {
  createQuotation,
  deleteQuotation,
  emailQuotation,
  markQuotationSent,
  quotationDefaults,
  quotationForEdit,
  reviseQuotation,
  updateQuotation,
} from "@/app/actions";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import type { OppDetail, ProductOption } from "@/server/queries";

type Q = OppDetail["quotations"][number];
type Line = { productId: string | null; description: string; mrp: string; price: string };
type Draft = { date: string; validityDays: string; toLine: string; schoolName: string; address: string; items: Line[] };

const VIA: Record<string, string> = { download: "downloaded", whatsapp: "WhatsApp", email: "email" };

export function QuotationsPanel({
  opp,
  products,
  emailReady,
  me,
}: {
  opp: OppDetail;
  products: ProductOption[];
  emailReady: boolean;
  me: { name: string };
}) {
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [sending, setSending] = useState<Q | null>(null);
  const { pending, run } = useAction();
  const today = todayIST();

  const startNew = () =>
    run(() => quotationDefaults(opp.id), {
      onDone: (d) =>
        d &&
        setEditing({
          id: null,
          draft: {
            date: d.date,
            validityDays: String(d.validityDays),
            toLine: d.toLine,
            schoolName: d.schoolName,
            address: d.address,
            items: d.items.map((i) => ({ productId: i.productId, description: i.description, mrp: "", price: "" })),
          },
        }),
    });

  const editDraft = (q: Q) => run(() => quotationForEdit(q.id), { onDone: (d) => d && setEditing({ id: q.id, draft: d }) });

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3>Quotations</h3>
        {!opp.closed ? (
          <button className="btn sm pri" disabled={pending} onClick={startNew}>
            <Icon name="plus" size={14} /> Create quotation
          </button>
        ) : null}
      </div>
      {opp.quotations.length ? (
        <div className="mt-2 flex flex-col gap-2">
          {opp.quotations.map((q) => (
            <div key={q.id} className="rounded-lg border border-line px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <b>{q.number}</b> <Pill tone={q.status === "SENT" ? "ok" : "mute"}>{q.status === "SENT" ? "Sent" : "Draft"}</Pill>
                  <div className="small muted">
                    {fmtDate(q.date, today)} · {q.lines} product{q.lines === 1 ? "" : "s"} · {q.preparedBy}
                    {q.sentAt ? ` · sent ${fmtDate(istDate(q.sentAt), today)} by ${VIA[q.sentVia ?? ""] ?? q.sentVia}` : ""}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a className="btn sm" href={`/api/quotations/${q.id}/pdf`} target="_blank" rel="noreferrer">
                    View PDF
                  </a>
                  {q.status === "DRAFT" ? (
                    <>
                      <button className="btn sm" onClick={() => editDraft(q)}>
                        Edit
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={pending}
                        onClick={() => confirm(`Delete draft ${q.number}?`) && run(() => deleteQuotation(q.id), { success: "Draft deleted." })}
                      >
                        Delete
                      </button>
                      <button className="btn sm pri" onClick={() => setSending(q)}>
                        Send quotation
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="btn sm" onClick={() => setSending(q)}>
                        Send again
                      </button>
                      {!opp.closed ? (
                        <button
                          className="btn sm"
                          disabled={pending}
                          onClick={() => run(() => reviseQuotation(q.id), { success: "New draft created from this quotation." })}
                        >
                          Revise
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="small muted mt-1">No quotations yet.</div>
      )}

      {editing ? (
        <QuotationEditor
          oppId={opp.id}
          id={editing.id}
          initial={editing.draft}
          products={products}
          me={me}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {sending ? <SendQuotation q={sending} opp={opp} emailReady={emailReady} me={me} onClose={() => setSending(null)} /> : null}
    </div>
  );
}

function QuotationEditor({
  oppId,
  id,
  initial,
  products,
  me,
  onClose,
}: {
  oppId: string;
  id: string | null;
  initial: Draft;
  products: ProductOption[];
  me: { name: string };
  onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [add, setAdd] = useState("");
  const { pending, run } = useAction();
  const setItem = (i: number, patch: Partial<Line>) => setD({ ...d, items: d.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  const addable = products.filter((p) => p.active);

  const save = () =>
    run(() => (id ? updateQuotation(id, d) : createQuotation(oppId, d)) as Promise<{ ok: true } | { ok: false; error: string }>, {
      success: id ? "Quotation saved." : "Quotation created as a draft. Use “Send quotation” when ready.",
      onDone: onClose,
    });

  return (
    <Modal
      title={id ? "Edit quotation" : "Create quotation"}
      sub={`Prepared by ${me.name}. Type the MRP and price for each product.`}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : id ? "Save draft" : "Create draft"}
          </button>
        </>
      }
    >
      <div className="fg2">
        <Field label="To" htmlFor="q-to">
          <input className="in" id="q-to" value={d.toLine} onChange={(e) => setD({ ...d, toLine: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" htmlFor="q-date">
            <DateInput id="q-date" value={d.date} onChange={(date) => setD({ ...d, date })} />
          </Field>
          <Field label="Validity (days)" htmlFor="q-valid">
            <input className="in" id="q-valid" type="number" min={1} value={d.validityDays} onChange={(e) => setD({ ...d, validityDays: e.target.value })} />
          </Field>
        </div>
        <Field label="School name" htmlFor="q-school">
          <input className="in" id="q-school" value={d.schoolName} onChange={(e) => setD({ ...d, schoolName: e.target.value })} />
        </Field>
        <Field label="Address" htmlFor="q-addr">
          <input className="in" id="q-addr" value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} />
        </Field>
      </div>

      <h3 className="mt-2">Products</h3>
      <div className="mt-2 flex flex-col gap-2">
        <div className="small hidden grid-cols-[28px_minmax(0,1fr)_120px_120px_70px] gap-2 px-1 font-semibold text-ink3 min-[701px]:grid">
          <span>No.</span>
          <span>Description</span>
          <span>MRP (₹)</span>
          <span>Price (₹)</span>
          <span />
        </div>
        {d.items.map((it, i) => (
          <div
            key={i}
            className="grid grid-cols-2 gap-2 rounded-lg border border-line p-2 min-[701px]:grid-cols-[28px_minmax(0,1fr)_120px_120px_70px] min-[701px]:items-center min-[701px]:border-0 min-[701px]:p-0 min-[701px]:px-1"
          >
            <span className="small faint col-span-2 min-[701px]:col-span-1">{i + 1}</span>
            <input
              className="in col-span-2 min-[701px]:col-span-1"
              aria-label={`Description, line ${i + 1}`}
              value={it.description}
              onChange={(e) => setItem(i, { description: e.target.value })}
            />
            <input
              className="in text-right"
              aria-label={`MRP, line ${i + 1}`}
              inputMode="decimal"
              placeholder="MRP"
              value={it.mrp}
              onChange={(e) => setItem(i, { mrp: e.target.value })}
            />
            <input
              className="in text-right"
              aria-label={`Price, line ${i + 1}`}
              inputMode="decimal"
              placeholder="Price"
              value={it.price}
              onChange={(e) => setItem(i, { price: e.target.value })}
            />
            <button
              className="btn ghost sm col-span-2 justify-center min-[701px]:col-span-1"
              aria-label={`Remove line ${i + 1}`}
              onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== i) })}
            >
              Remove
            </button>
          </div>
        ))}
        {!d.items.length ? <div className="small muted">No products yet. Add one below.</div> : null}
      </div>
      <div className="mt-3 flex gap-2">
        <select className="sel" aria-label="Add a product" value={add} onChange={(e) => setAdd(e.target.value)}>
          <Options list={addable.map((p) => [p.id, p.name] as const)} blank="Choose a product to add…" />
        </select>
        <button
          className="btn"
          disabled={!add}
          onClick={() => {
            const p = products.find((x) => x.id === add)!;
            setD({ ...d, items: [...d.items, { productId: p.id, description: p.name, mrp: "", price: "" }] });
            setAdd("");
          }}
        >
          Add
        </button>
      </div>
      <p className="small muted mt-2">Products come from Settings → Products. The description can be edited for this quotation.</p>
    </Modal>
  );
}

function SendQuotation({
  q,
  opp,
  emailReady,
  me,
  onClose,
}: {
  q: Q;
  opp: OppDetail;
  emailReady: boolean;
  me: { name: string };
  onClose: () => void;
}) {
  const toast = useToast();
  const { pending, run } = useAction();
  const [to, setTo] = useState(opp.lead?.email ?? "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState(
    `Dear Sir/Madam,\n\nPlease find attached our quotation ${q.number} for ${opp.schoolName}.\n\nWe look forward to working with you.\n\nRegards,\n${me.name}\nWonder Learning India Pvt. Ltd.`,
  );
  const mobile = (opp.lead?.mobile ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "91$1");

  const whatsapp = () => {
    const link = `${window.location.origin}/q/${q.shareToken}`;
    const text = `Dear Sir/Madam,\nPlease find our quotation ${q.number} for ${opp.schoolName}:\n${link}\n\nRegards,\n${me.name}\nWonder Learning`;
    // Open straight away (inside the click) so the browser doesn't block it.
    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    run(() => markQuotationSent(q.id, "whatsapp"), { success: `${q.number} marked as sent on WhatsApp.`, onDone: onClose });
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = `/api/quotations/${q.id}/pdf?download=1`;
    a.click();
    run(() => markQuotationSent(q.id, "download"), { success: `${q.number} downloaded and marked as sent.`, onDone: onClose });
  };

  return (
    <Modal
      title={`Send ${q.number}`}
      sub={`${opp.schoolName}${opp.stage === "INTERESTED" || opp.stage === "DEMO_SCHEDULED" ? " · sending moves this deal to Proposal Sent" : ""}`}
      wide
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-2 min-[701px]:grid-cols-3">
        <a className="btn justify-center" href={`/api/quotations/${q.id}/pdf`} target="_blank" rel="noreferrer">
          Preview PDF
        </a>
        <button className="btn justify-center" disabled={pending} onClick={download}>
          <Icon name="download" size={16} /> Download PDF
        </button>
        <button className="btn justify-center" disabled={pending || !mobile} onClick={whatsapp} title={mobile ? "" : "No mobile number on the lead"}>
          <Icon name="chat" size={16} /> Share on WhatsApp
        </button>
      </div>
      <p className="small muted mt-2">
        WhatsApp opens a message to {opp.lead?.mobile ?? "the school"} with a private link to the PDF. Download saves the PDF so you can attach it
        yourself.
      </p>

      <h3 className="mt-4">Email from the CRM</h3>
      {emailReady ? (
        <>
          <div className="fg2 mt-2">
            <Field label="To *" htmlFor="qe-to">
              <input className="in" id="qe-to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
            <Field label="CC" htmlFor="qe-cc">
              <input className="in" id="qe-cc" placeholder="Optional, separate with commas" value={cc} onChange={(e) => setCc(e.target.value)} />
            </Field>
          </div>
          <Field label="Message" htmlFor="qe-msg">
            <textarea className="ta min-h-[150px]" id="qe-msg" value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(() => emailQuotation(q.id, { to, cc, message }), {
                success: `${q.number} emailed to ${to}.`,
                onDone: () => {
                  toast("Email sent with the PDF attached.");
                  onClose();
                },
              })
            }
          >
            {pending ? "Sending…" : "Send email with PDF"}
          </button>
        </>
      ) : (
        <div className="note mt-2">
          Email sending isn&apos;t switched on yet. Once your admin connects an email account (see DEPLOY.md), you&apos;ll be able to send the
          quotation from here. Until then, use Download or WhatsApp above.
        </div>
      )}
    </Modal>
  );
}
