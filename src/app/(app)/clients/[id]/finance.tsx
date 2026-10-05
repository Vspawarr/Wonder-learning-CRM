"use client";

// Client page: sales orders, invoices, payments and reminders.
import { useRouter } from "next/navigation";
import { useApp } from "@/components/app-context";
import { useState } from "react";
import { Field, Modal, Options, useAction, useToast } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Pill, type Tone } from "@/components/ui";
import {
  cancelInvoice,
  cancelSalesOrder,
  createCreditNote,
  deleteCreditNote,
  recordAdvance,
  setChequeStatus,
  createInvoice,
  createSalesOrder,
  deletePayment,
  emailInvoice,
  emailReceipt,
  logReceiptShared,
  invoiceDefaults,
  logInvoiceWhatsApp,
  markDelivered,
  orderableQuotations,
  recordPayment,
  salesOrderDefaults,
  salesOrderForEdit,
  setPurchaseOrder,
  updateSalesOrder,
} from "@/app/actions";
import {
  CHEQUE_MODES,
  PAYMENT_MODES,
  PAYMENT_STATUS_LABEL,
} from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { dmy, inrExact } from "@/lib/format";
import type { InvoiceState } from "@/server/finance/money";
import type { InvoiceRow } from "@/server/finance/service";
import type { ClientDetail, ProductOption } from "@/server/queries";
import { PoTemplateModal, type QuoteTarget } from "../../pipeline/quotations";
import { DispatchSection } from "./dispatch";
import { openWhatsApp } from "@/lib/phone";

const money = inrExact;

export const STATE_LABEL: Record<InvoiceState, string> = {
  PAID: "Paid",
  PARTIAL: "Partially paid",
  UNPAID: "Unpaid",
  OVERDUE: "Overdue",
  CANCELLED: "Cancelled",
};
const STATE_TONE: Record<InvoiceState, Tone> = {
  PAID: "ok",
  PARTIAL: "warn",
  UNPAID: "info",
  OVERDUE: "bad",
  CANCELLED: "mute",
};

export function InvoiceStatePill({
  row,
}: {
  row: Pick<InvoiceRow, "state" | "daysOverdue">;
}) {
  return (
    <Pill tone={STATE_TONE[row.state]}>
      {row.state === "OVERDUE"
        ? `Overdue ${row.daysOverdue} day${row.daysOverdue === 1 ? "" : "s"}`
        : STATE_LABEL[row.state]}
    </Pill>
  );
}

/* ---------- sales orders ---------- */

type SO = ClientDetail["salesOrders"][number];
type OrderLine = {
  productId: string | null;
  description: string;
  qty: string;
  price: string;
  gstRate: string;
};
type OrderDraft = {
  date: string;
  expectedDelivery: string;
  notes: string;
  poNumber: string;
  poDate: string;
  quotationId: string;
  quotationLabel: string;
  items: OrderLine[];
};

/** Uploads the signed PO file for an order. */
async function uploadPo(
  salesOrderId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = new FormData();
  body.append("file", file);
  try {
    const r = await fetch(`/api/sales-orders/${salesOrderId}/po`, {
      method: "POST",
      body,
    });
    return (await r.json()) as { ok: true } | { ok: false; error: string };
  } catch {
    return {
      ok: false,
      error: "The upload failed. Check your internet connection and try again.",
    };
  }
}

const PO_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

function PoFileInput({
  id,
  onChange,
}: {
  id: string;
  onChange: (f: File | null) => void;
}) {
  return (
    <input
      className="in"
      id={id}
      type="file"
      accept={PO_ACCEPT}
      onChange={(e) => onChange(e.target.files?.[0] ?? null)}
    />
  );
}

const SO_TONE: Record<SO["status"], Tone> = {
  CONFIRMED: "info",
  DELIVERED: "ok",
  CANCELLED: "mute",
};
const SO_LABEL: Record<SO["status"], string> = {
  CONFIRMED: "Confirmed",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export function SalesOrdersPanel({
  client,
  products,
  me,
  emailReady,
}: {
  client: ClientDetail;
  products: ProductOption[];
  me: { name: string };
  emailReady: boolean;
}) {
  const { pending, run } = useAction();
  const [poTemplate, setPoTemplate] = useState<
    "choose" | ClientDetail["quotations"][number] | null
  >(null);
  const sentQuotes = client.quotations.filter((q) => q.status === "SENT");
  const target: QuoteTarget = {
    parent: { clientId: client.id },
    schoolName: client.schoolName,
    closed: false,
    stage: null,
    email: client.email,
    mobile: client.mobile,
    quotations: client.quotations,
  };
  const [choosing, setChoosing] = useState<
    { id: string; label: string }[] | null
  >(null);
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: OrderDraft;
  } | null>(null);
  const [delivering, setDelivering] = useState<SO | null>(null);
  const [poFor, setPoFor] = useState<SO | null>(null);
  const [advanceFor, setAdvanceFor] = useState<SO | null>(null);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const { features } = useApp();
  const [invoicing, setInvoicing] = useState<{
    so: SO;
    date: string;
    dueDate: string;
  } | null>(null);

  const start = () =>
    run(() => orderableQuotations(client.id), {
      onDone: (list) => setChoosing(list ?? []),
    });
  const fromQuotation = (quotationId: string | null) =>
    run(() => salesOrderDefaults(client.id, quotationId), {
      onDone: (d) => {
        if (!d) return;
        setChoosing(null);
        setEditing({
          id: null,
          draft: { ...d, items: d.items.length ? d.items : [blankLine()] },
        });
      },
    });
  const edit = (so: SO) =>
    run(() => salesOrderForEdit(so.id), {
      onDone: (d) => d && setEditing({ id: so.id, draft: d }),
    });
  const invoice = (so: SO) =>
    run(() => invoiceDefaults(so.id), {
      onDone: (d) => d && setInvoicing({ so, ...d }),
    });

  return (
    <>
      <div className="mb-3 rounded-lg border border-line bg-surf2 p-3">
        <div className="font-semibold">Purchase order (PO)</div>
        <ol className="small mt-2 flex flex-col gap-2.5">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <b>1.</b> Send the school a PO template made from your quotation,
              to sign and seal.
            </span>
            <button
              className="btn sm pri"
              disabled={!sentQuotes.length}
              title={sentQuotes.length ? "" : "Send a quotation first"}
              onClick={() =>
                setPoTemplate(
                  sentQuotes.length === 1 ? sentQuotes[0] : "choose",
                )
              }
            >
              <Icon name="doc" size={14} /> Send PO template
            </button>
          </li>
          {!sentQuotes.length ? (
            <li className="faint">
              Send a quotation (below) first; the PO template is made from it.
            </li>
          ) : null}
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <b>2.</b> Got the signed PO back? Upload it with its PO number;
              this creates the sales order.
            </span>
            <button className="btn sm pri" disabled={pending} onClick={start}>
              <Icon name="upload" size={14} /> Upload signed PO
            </button>
          </li>
        </ol>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="small muted">
          Kits ordered by the school. Raise an invoice from an order.
        </span>
        <button className="btn sm pri" disabled={pending} onClick={start}>
          <Icon name="plus" size={14} /> New sales order
        </button>
      </div>
      {client.salesOrders.length ? (
        <div className="flex flex-col gap-2">
          {client.salesOrders.map((so) => (
            <div
              key={so.id}
              className="rounded-lg border border-line px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <b>{so.number}</b>{" "}
                  <Pill tone={SO_TONE[so.status]}>{SO_LABEL[so.status]}</Pill>{" "}
                  {so.invoice ? (
                    <span className="tag">Invoiced · {so.invoice.number}</span>
                  ) : null}
                  <div className="small muted">
                    {dmy(so.date)} · {so.kits} kit{so.kits === 1 ? "" : "s"} ·{" "}
                    <b className="text-ink">{money(so.total)}</b>
                    {so.quotationNumber
                      ? ` · from ${so.quotationNumber} (quotation created ${so.quotationCreatedAt})`
                      : ""}
                    {so.deliveredOn
                      ? ` · delivered ${dmy(so.deliveredOn)}`
                      : so.expectedDelivery
                        ? ` · delivery by ${dmy(so.expectedDelivery)}`
                        : ""}
                  </div>
                  <div className="small mt-1">
                    {so.poNumber ? (
                      <>
                        <b>PO {so.poNumber}</b>
                        {so.poDate ? ` dated ${dmy(so.poDate)}` : ""}
                        {so.poFileName ? (
                          <>
                            {" · "}
                            <a
                              href={`/api/sales-orders/${so.id}/po`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View signed PO
                            </a>
                          </>
                        ) : (
                          <span className="faint">
                            {" "}
                            · signed PO not uploaded
                          </span>
                        )}
                      </>
                    ) : so.status !== "CANCELLED" ? (
                      <span className="text-sun">PO pending</span>
                    ) : null}
                  </div>
                  {so.advanceReceived || so.advancePending || so.advanceAwaiting ? (
                    <div className="small mt-1">
                      Advance received <b>{money(so.advanceReceived)}</b>
                      {so.advanceAwaiting ? <span className="text-sun"> · waiting for Accounts approval {money(so.advanceAwaiting)}</span> : null}
                      {so.advancePending ? (
                        <span className="text-sun">
                          {" "}
                          · cheques awaiting clearance{" "}
                          {money(so.advancePending)}
                        </span>
                      ) : null}
                      {so.proformaNumber ? (
                        <span className="muted">
                          {" "}
                          · proforma {so.proformaNumber}
                        </span>
                      ) : null}
                    </div>
                  ) : so.proformaNumber ? (
                    <div className="small muted mt-1">
                      Proforma {so.proformaNumber}
                    </div>
                  ) : null}
                  {so.notes ? (
                    <div className="small mt-1 whitespace-pre-line">
                      {so.notes}
                    </div>
                  ) : null}
                  {features.dispatch && so.items.length ? (
                    <DispatchSection so={so} clientId={client.id} />
                  ) : null}
                </div>
                {so.status !== "CANCELLED" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {!so.invoice ? (
                      <>
                        <button
                          className="btn sm"
                          disabled={pending}
                          onClick={() => edit(so)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn sm pri"
                          disabled={pending}
                          onClick={() => invoice(so)}
                        >
                          Create invoice
                        </button>
                      </>
                    ) : null}
                    {!so.invoice && features.advance ? (
                      <>
                        <a
                          className="btn sm"
                          href={`/api/sales-orders/${so.id}/proforma`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Proforma invoice
                        </a>
                        {so.total - so.advanceReceived - so.advancePending - so.advanceAwaiting >
                        0 ? (
                          <button
                            className="btn sm"
                            onClick={() => setAdvanceFor(so)}
                          >
                            Take advance
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    <button className="btn sm" onClick={() => setPoFor(so)}>
                      <Icon name="upload" size={14} />{" "}
                      {so.poNumber ? "PO" : "Add PO"}
                    </button>
                    {so.status === "CONFIRMED" && !features.dispatch ? (
                      <button
                        className="btn sm"
                        onClick={() => setDelivering(so)}
                      >
                        Mark delivered
                      </button>
                    ) : null}
                    {!so.invoice ? (
                      <button
                        className="btn sm ghost"
                        disabled={pending}
                        onClick={() =>
                          confirm(`Cancel sales order ${so.number}?`) &&
                          run(() => cancelSalesOrder(so.id), {
                            success: "Order cancelled.",
                          })
                        }
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="small muted">No sales orders yet.</div>
      )}

      {choosing ? (
        <Modal
          title="New sales order"
          sub="Start from a quotation the school accepted, or a blank order."
          onClose={() => setChoosing(null)}
          footer={
            <button className="btn" onClick={() => setChoosing(null)}>
              Cancel
            </button>
          }
        >
          <div className="flex flex-col gap-2">
            {choosing.map((q) => (
              <button
                key={q.id}
                className="btn justify-start"
                disabled={pending}
                onClick={() => fromQuotation(q.id)}
              >
                <Icon name="doc" size={16} /> From quotation {q.label}
              </button>
            ))}
            {!choosing.length ? (
              <div className="small muted">
                No sent quotations yet. You can still make a blank order.
              </div>
            ) : null}
            <button
              className="btn justify-start"
              disabled={pending}
              onClick={() => fromQuotation(null)}
            >
              <Icon name="plus" size={16} /> Blank order
            </button>
          </div>
        </Modal>
      ) : null}

      {editing ? (
        <OrderEditor
          clientId={client.id}
          id={editing.id}
          initial={editing.draft}
          products={products}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {delivering ? (
        <DeliverModal so={delivering} onClose={() => setDelivering(null)} />
      ) : null}
      {poFor ? <PoModal so={poFor} onClose={() => setPoFor(null)} /> : null}
      {advanceFor ? (
        <PaymentModal
          target={{
            kind: "advance",
            id: advanceFor.id,
            number: advanceFor.number,
            school: client.schoolName,
            available:
              Math.round(
                (advanceFor.total -
                  advanceFor.advanceReceived -
                  advanceFor.advancePending -
                  advanceFor.advanceAwaiting) *
                  100,
              ) / 100,
            total: advanceFor.total,
          }}
          onClose={() => setAdvanceFor(null)}
          onSaved={(r) => {
            const so = advanceFor;
            setAdvanceFor(null);
            setReceipt({ ...r, against: `order ${so.number} (advance)` });
          }}
        />
      ) : null}
      {receipt ? (
        <SendReceipt
          r={receipt}
          contact={client}
          emailReady={emailReady}
          me={me}
          justRecorded
          onClose={() => setReceipt(null)}
        />
      ) : null}
      {poTemplate === "choose" ? (
        <Modal
          title="Send PO template"
          sub="Which quotation is the PO for?"
          onClose={() => setPoTemplate(null)}
          footer={
            <button className="btn" onClick={() => setPoTemplate(null)}>
              Cancel
            </button>
          }
        >
          <div className="flex flex-col gap-2">
            {sentQuotes.map((q) => (
              <button
                key={q.id}
                className="btn justify-start"
                onClick={() => setPoTemplate(q)}
              >
                <Icon name="doc" size={16} /> {q.number} · created {q.createdAt}
              </button>
            ))}
          </div>
        </Modal>
      ) : poTemplate ? (
        <PoTemplateModal
          q={poTemplate}
          target={target}
          me={me}
          onClose={() => setPoTemplate(null)}
        />
      ) : null}

      {invoicing ? (
        <Modal
          title={`Invoice ${invoicing.so.number}`}
          sub={`${client.schoolName} · ${money(invoicing.so.total)}`}
          onClose={() => setInvoicing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setInvoicing(null)}>
                Cancel
              </button>
              <button
                className="btn pri"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      createInvoice(invoicing.so.id, {
                        date: invoicing.date,
                        dueDate: invoicing.dueDate,
                      }),
                    {
                      success:
                        "Invoice raised. A payment follow-up is booked for the due date.",
                      onDone: () => setInvoicing(null),
                    },
                  )
                }
              >
                {pending ? "Creating…" : "Create invoice"}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
            <Field label="Invoice date" htmlFor="inv-date">
              <DateInput
                id="inv-date"
                value={invoicing.date}
                onChange={(date) => setInvoicing({ ...invoicing, date })}
              />
            </Field>
            <Field label="Payment due by" htmlFor="inv-due">
              <DateInput
                id="inv-due"
                value={invoicing.dueDate}
                onChange={(dueDate) => setInvoicing({ ...invoicing, dueDate })}
              />
            </Field>
          </div>
          <p className="small muted">
            The invoice copies the order&apos;s products, kits, prices and GST.{" "}
            {client.owner.name} gets a follow-up on the due date to collect the
            payment.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

const blankLine = (): OrderLine => ({
  productId: null,
  description: "",
  qty: "",
  price: "",
  gstRate: "0",
});
const num = (s: string) => {
  const n = Number(String(s).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

function OrderEditor({
  clientId,
  id,
  initial,
  products,
  onClose,
}: {
  clientId: string;
  id: string | null;
  initial: OrderDraft;
  products: ProductOption[];
  onClose: () => void;
}) {
  const [d, setD] = useState<OrderDraft>(initial);
  const [add, setAdd] = useState("");
  const [poFile, setPoFile] = useState<File | null>(null);
  const router = useRouter();
  const { pending, run } = useAction();
  const setItem = (i: number, patch: Partial<OrderLine>) =>
    setD({
      ...d,
      items: d.items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    });
  const lineTotal = (l: OrderLine) =>
    num(l.qty) * num(l.price) * (1 + num(l.gstRate) / 100);
  const total = d.items.reduce((s, l) => s + lineTotal(l), 0);

  const save = () =>
    run(
      async () => {
        const r = id
          ? await updateSalesOrder(id, d)
          : await createSalesOrder(clientId, d);
        if (!r.ok) return r;
        const soId = id ?? (r.data as string);
        if (poFile && soId) {
          const u = await uploadPo(soId, poFile);
          if (!u.ok)
            return {
              ok: false as const,
              error: `Order saved, but the PO file wasn't uploaded: ${u.error}`,
            };
        }
        return { ok: true as const };
      },
      {
        success: id ? "Sales order saved." : "Sales order created.",
        onDone: () => {
          onClose();
          if (poFile) router.refresh(); // the PO file went up separately
        },
      },
    );

  return (
    <Modal
      title={id ? "Edit sales order" : "New sales order"}
      sub={
        d.quotationLabel
          ? `From quotation ${d.quotationLabel}. Enter the number of kits for each product; GST is 0% unless you change it.`
          : "Enter the number of kits for each product. GST is 0% for educational material unless you change it."
      }
      wide
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto font-semibold">
            Total {money(Math.round(total * 100) / 100)}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : id ? "Save order" : "Create order"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="School's PO number" htmlFor="so-po">
          <input
            className="in"
            id="so-po"
            placeholder="As written on their PO"
            value={d.poNumber}
            onChange={(e) => setD({ ...d, poNumber: e.target.value })}
          />
        </Field>
        <Field label="PO date" htmlFor="so-podate">
          <DateInput
            id="so-podate"
            value={d.poDate}
            onChange={(poDate) => setD({ ...d, poDate })}
          />
        </Field>
        <Field label="Signed PO (PDF or photo, up to 4 MB)" htmlFor="so-pofile">
          <PoFileInput id="so-pofile" onChange={setPoFile} />
        </Field>
        <div className="small muted self-center">
          No PO yet? Save the order now and add the PO later with the <b>PO</b>{" "}
          button. The PO number prints on the invoice.
        </div>
        <Field label="Order date" htmlFor="so-date">
          <DateInput
            id="so-date"
            value={d.date}
            onChange={(date) => setD({ ...d, date })}
          />
        </Field>
        <Field label="Expected delivery" htmlFor="so-exp">
          <DateInput
            id="so-exp"
            value={d.expectedDelivery}
            onChange={(expectedDelivery) => setD({ ...d, expectedDelivery })}
          />
        </Field>
      </div>

      <h3 className="mt-2">Products</h3>
      <div className="mt-2 flex flex-col gap-2">
        <div className="small hidden grid-cols-[minmax(0,1fr)_80px_110px_70px_100px_70px] gap-2 px-1 font-semibold text-ink3 min-[761px]:grid">
          <span>Description</span>
          <span>No. of kits</span>
          <span>Price (₹)</span>
          <span>GST %</span>
          <span className="text-right">Amount</span>
          <span />
        </div>
        {d.items.map((it, i) => (
          <div
            key={i}
            className="grid grid-cols-3 gap-2 rounded-lg border border-line p-2 min-[761px]:grid-cols-[minmax(0,1fr)_80px_110px_70px_100px_70px] min-[761px]:items-center min-[761px]:border-0 min-[761px]:p-0 min-[761px]:px-1"
          >
            <input
              className="in col-span-3 min-[761px]:col-span-1"
              aria-label={`Description, line ${i + 1}`}
              placeholder="Description"
              value={it.description}
              onChange={(e) => setItem(i, { description: e.target.value })}
            />
            <input
              className="in text-right"
              aria-label={`Number of kits, line ${i + 1}`}
              inputMode="numeric"
              placeholder="Kits"
              value={it.qty}
              onChange={(e) => setItem(i, { qty: e.target.value })}
            />
            <input
              className="in text-right"
              aria-label={`Price, line ${i + 1}`}
              inputMode="decimal"
              placeholder="Price"
              value={it.price}
              onChange={(e) => setItem(i, { price: e.target.value })}
            />
            <input
              className="in text-right"
              aria-label={`GST %, line ${i + 1}`}
              inputMode="decimal"
              placeholder="GST %"
              value={it.gstRate}
              onChange={(e) => setItem(i, { gstRate: e.target.value })}
            />
            <span className="col-span-2 self-center text-right font-semibold min-[761px]:col-span-1">
              {money(Math.round(lineTotal(it) * 100) / 100)}
            </span>
            <button
              className="btn ghost sm justify-center"
              aria-label={`Remove line ${i + 1}`}
              onClick={() =>
                setD({ ...d, items: d.items.filter((_, j) => j !== i) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        {!d.items.length ? (
          <div className="small muted">No products yet. Add one below.</div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <select
          className="sel min-w-0 flex-1"
          aria-label="Add a product"
          value={add}
          onChange={(e) => setAdd(e.target.value)}
        >
          <Options
            list={products
              .filter((p) => p.active)
              .map((p) => [p.id, p.name] as const)}
            blank="Choose a product to add…"
          />
        </select>
        <button
          className="btn"
          disabled={!add}
          onClick={() => {
            const p = products.find((x) => x.id === add)!;
            setD({
              ...d,
              items: [
                ...d.items,
                { ...blankLine(), productId: p.id, description: p.name },
              ],
            });
            setAdd("");
          }}
        >
          Add
        </button>
        <button
          className="btn ghost"
          onClick={() => setD({ ...d, items: [...d.items, blankLine()] })}
        >
          Add other line
        </button>
      </div>
      <Field label="Notes" htmlFor="so-notes">
        <textarea
          className="ta"
          id="so-notes"
          placeholder="Optional, e.g. PO number, delivery address"
          value={d.notes}
          onChange={(e) => setD({ ...d, notes: e.target.value })}
        />
      </Field>
    </Modal>
  );
}

function PoModal({ so, onClose }: { so: SO; onClose: () => void }) {
  const [v, setV] = useState({
    poNumber: so.poNumber ?? "",
    poDate: so.poDate ?? "",
  });
  const [file, setFile] = useState<File | null>(null);
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <Modal
      title={`Purchase order · ${so.number}`}
      sub="The school's PO number prints on the invoice, even if the invoice is already made."
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
                  const r = await setPurchaseOrder(so.id, v);
                  if (!r.ok || !file) return r;
                  return uploadPo(so.id, file);
                },
                {
                  success: file ? "PO saved and file uploaded." : "PO saved.",
                  onDone: () => {
                    onClose();
                    router.refresh();
                  },
                },
              )
            }
          >
            {pending ? "Saving…" : "Save PO"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="PO number *" htmlFor="po-no">
          <input
            className="in"
            id="po-no"
            value={v.poNumber}
            onChange={(e) => setV({ ...v, poNumber: e.target.value })}
          />
        </Field>
        <Field label="PO date" htmlFor="po-date">
          <DateInput
            id="po-date"
            value={v.poDate}
            onChange={(poDate) => setV({ ...v, poDate })}
          />
        </Field>
      </div>
      <Field
        label={
          so.poFileName
            ? `Replace signed PO (now: ${so.poFileName})`
            : "Upload signed PO (PDF or photo, up to 4 MB)"
        }
        htmlFor="po-file"
      >
        <PoFileInput id="po-file" onChange={setFile} />
      </Field>
      {so.poFileName ? (
        <a
          className="small"
          href={`/api/sales-orders/${so.id}/po`}
          target="_blank"
          rel="noreferrer"
        >
          View the uploaded PO
        </a>
      ) : null}
    </Modal>
  );
}

function DeliverModal({ so, onClose }: { so: SO; onClose: () => void }) {
  const [date, setDate] = useState(todayIST());
  const { pending, run } = useAction();
  return (
    <Modal
      title={`Mark ${so.number} delivered`}
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
              run(() => markDelivered(so.id, date), {
                success: "Marked as delivered.",
                onDone: onClose,
              })
            }
          >
            Mark delivered
          </button>
        </>
      }
    >
      <Field label="Delivered on" htmlFor="so-deliv">
        <DateInput id="so-deliv" value={date} onChange={setDate} />
      </Field>
    </Modal>
  );
}

/* ---------- invoices ---------- */

export type Person = {
  name: string;
  role?: string;
  mobile: string | null;
  email: string | null;
  forPayments?: boolean;
};

export type Contact = {
  schoolName: string;
  mobile: string;
  email: string | null;
  /** Other people at the school; the one marked for payments is picked by default. */
  people?: Person[];
};

function peopleOf(c: Contact): Person[] {
  return [
    { name: "Main contact", mobile: c.mobile, email: c.email },
    ...(c.people ?? []),
  ];
}
const defaultPerson = (c: Contact) =>
  peopleOf(c).find((p) => p.forPayments) ?? peopleOf(c)[0];

/** "Send to" chooser shown when the school has more than one contact. */
function RecipientPicker({
  contact,
  value,
  onChange,
}: {
  contact: Contact;
  value: Person;
  onChange: (p: Person) => void;
}) {
  const people = peopleOf(contact);
  if (people.length < 2) return null;
  return (
    <Field label="Send to" htmlFor="rcpt-who">
      <select
        className="sel"
        id="rcpt-who"
        value={people.indexOf(value)}
        onChange={(e) => onChange(people[Number(e.target.value)])}
      >
        {people.map((p, i) => (
          <option key={i} value={i}>
            {p.name}
            {p.role ? ` (${p.role})` : ""}
            {p.mobile ? ` · ${p.mobile}` : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Record payment + send/remind buttons for one invoice (client page and Outstanding page). */
export function InvoiceButtons({
  row,
  contact,
  emailReady,
  me,
  compact,
}: {
  row: InvoiceRow;
  contact: Contact;
  emailReady: boolean;
  me: { name: string };
  compact?: boolean;
}) {
  const [paying, setPaying] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [sending, setSending] = useState<"invoice" | "reminder" | null>(null);
  const { pending, run } = useAction();
  const { canFinance, features } = useApp();
  const live = row.state !== "CANCELLED";
  const owed = live && row.balance > 0;
  // Reminders go to the school's payments contact (e.g. Accounts) when one is set.
  const pay = row.client.payContact;
  const to: Contact = pay && !contact.people ? { ...contact, people: [{ ...pay, forPayments: true }] } : contact;
  // Cheques not yet cleared, and payments waiting for Accounts, already cover part of the balance.
  const payable = Math.round((row.balance - row.pending - row.awaiting) * 100) / 100;
  return (
    <div className="flex flex-wrap gap-1.5">
      <a
        className="btn sm"
        href={`/api/invoices/${row.id}/pdf`}
        target="_blank"
        rel="noreferrer"
      >
        View PDF
      </a>
      {owed ? (
        <>
          {payable > 0 ? (
            <button className="btn sm pri" onClick={() => setPaying(true)}>
              Record payment
            </button>
          ) : null}
          <button className="btn sm" onClick={() => setSending("reminder")}>
            <Icon name="chat" size={14} /> Send reminder
          </button>
        </>
      ) : null}
      {live && !compact ? (
        <button className="btn sm" onClick={() => setSending("invoice")}>
          Send invoice
        </button>
      ) : null}
      {owed && !compact && canFinance && features.creditNotes ? (
        <button className="btn sm" onClick={() => setCrediting(true)}>
          Credit note
        </button>
      ) : null}
      {live &&
      !compact &&
      row.paid === 0 &&
      row.pending === 0 &&
      row.credited === 0 &&
      canFinance ? (
        <button
          className="btn sm ghost"
          disabled={pending}
          onClick={() =>
            confirm(
              `Cancel invoice ${row.number}? The order can then be edited or invoiced again.`,
            ) &&
            run(() => cancelInvoice(row.id), { success: "Invoice cancelled." })
          }
        >
          Cancel
        </button>
      ) : null}
      {paying ? (
        <PaymentModal
          target={{
            kind: "invoice",
            id: row.id,
            number: row.number,
            school: row.client.schoolName,
            available: payable,
            total: row.total,
          }}
          onClose={() => setPaying(false)}
          onSaved={(r) => {
            setPaying(false);
            setReceipt({ ...r, against: `invoice ${row.number}` });
          }}
        />
      ) : null}
      {crediting ? (
        <CreditNoteModal row={row} onClose={() => setCrediting(false)} />
      ) : null}
      {receipt ? (
        <SendReceipt
          r={receipt}
          contact={to}
          emailReady={emailReady}
          me={me}
          justRecorded
          onClose={() => setReceipt(null)}
        />
      ) : null}
      {sending ? (
        <SendInvoice
          row={row}
          kind={sending}
          contact={to}
          emailReady={emailReady}
          me={me}
          onClose={() => setSending(null)}
        />
      ) : null}
    </div>
  );
}

export function InvoicesPanel({
  client,
  emailReady,
  me,
}: {
  client: ClientDetail;
  emailReady: boolean;
  me: { name: string };
}) {
  if (!client.invoices.length)
    return (
      <div className="small muted">
        No invoices yet. Create one from a sales order.
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {[...client.invoices].reverse().map((r) => (
        <div key={r.id} className="rounded-lg border border-line px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <b>{r.number}</b> <InvoiceStatePill row={r} />
          </div>
          <div className="small muted">
            {dmy(r.date)} · due {dmy(r.dueDate)} · order {r.salesOrder.number}
            {r.salesOrder.poNumber ? ` · PO ${r.salesOrder.poNumber}` : ""}
          </div>
          <div className="my-1.5 grid grid-cols-3 gap-2 text-[13px]">
            <div>
              <div className="small faint">Total</div>
              <b>{money(r.total)}</b>
            </div>
            <div>
              <div className="small faint">Received</div>
              <b>{money(r.paid)}</b>
            </div>
            <div>
              <div className="small faint">Balance</div>
              <b className={r.state === "OVERDUE" ? "text-coral" : ""}>
                {money(r.balance)}
              </b>
            </div>
          </div>
          {r.pending || r.credited || r.awaiting ? (
            <div className="small mb-1.5">
              {r.awaiting ? <span className="text-sun">Waiting for Accounts approval: {money(r.awaiting)}. </span> : null}
              {r.pending ? (
                <span className="text-sun">
                  Cheques awaiting clearance: {money(r.pending)}.{" "}
                </span>
              ) : null}
              {r.credited ? (
                <span className="muted">
                  Credit notes: {money(r.credited)}.
                </span>
              ) : null}
            </div>
          ) : null}
          <InvoiceButtons
            row={r}
            contact={client}
            emailReady={emailReady}
            me={me}
          />
        </div>
      ))}
    </div>
  );
}

export type PayTarget = {
  kind: "invoice" | "advance";
  id: string;
  number: string;
  school: string;
  /** The most that can be recorded now. */
  available: number;
  total: number;
};

/** Record a payment on an invoice, or an advance on a sales order. Cheques get their own details. */
export function PaymentModal({
  target,
  onClose,
  onSaved,
}: {
  target: PayTarget;
  onClose: () => void;
  onSaved: (r: {
    paymentId: string;
    number: string;
    shareToken: string;
    amount: number;
    balance: number;
  }) => void;
}) {
  const { features } = useApp();
  const [p, setP] = useState({
    amount: target.kind === "invoice" ? String(target.available) : "",
    date: todayIST(),
    mode: "",
    reference: "",
    bank: "",
    chequeDate: "",
    note: "",
    promiseDate: "",
  });
  const { pending, run } = useAction();
  const toast = useToast();
  const amt = Number(p.amount.replace(/,/g, ""));
  const partial =
    target.kind === "invoice" &&
    Number.isFinite(amt) &&
    amt > 0 &&
    amt < target.available;
  const cheque = features.cheques && CHEQUE_MODES.includes(p.mode);
  const save = () =>
    run(
      () => {
        const data = { ...p, promiseDate: partial ? p.promiseDate : "" };
        return target.kind === "invoice"
          ? recordPayment(target.id, data)
          : recordAdvance(target.id, data);
      },
      {
        onDone: (r) => {
          if (!r) return onClose();
          // Recorded by the team: Accounts approves it first; the receipt comes after that (R36).
          if (r.awaiting || !r.receiptNumber) {
            toast("Payment recorded and sent to Accounts for approval. You can send the receipt once it is approved.");
            return onClose();
          }
          toast(cheque ? "Cheque recorded. It counts as received once you mark it cleared." : "Payment recorded. Receipt ready to send.");
          onSaved({
            paymentId: r.paymentId,
            number: r.receiptNumber,
            shareToken: r.shareToken,
            amount: r.amount,
            balance: r.balance,
          });
        },
      },
    );
  return (
    <Modal
      title={
        target.kind === "invoice"
          ? `Record payment · ${target.number}`
          : `Advance payment · ${target.number}`
      }
      sub={`${target.school} · ${target.kind === "invoice" ? `${money(target.available)} still due of ${money(target.total)}` : `order total ${money(target.total)}, up to ${money(target.available)} can be taken now`}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save payment"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="Amount received (₹) *" htmlFor="pay-amt">
          <input
            className="in"
            id="pay-amt"
            inputMode="decimal"
            value={p.amount}
            onChange={(e) => setP({ ...p, amount: e.target.value })}
          />
        </Field>
        <Field label="Received on *" htmlFor="pay-date">
          <DateInput
            id="pay-date"
            value={p.date}
            onChange={(date) => setP({ ...p, date })}
          />
        </Field>
        <Field label="Mode *" htmlFor="pay-mode">
          <select
            className="sel"
            id="pay-mode"
            value={p.mode}
            onChange={(e) => setP({ ...p, mode: e.target.value })}
          >
            <Options list={PAYMENT_MODES} blank="Choose…" />
          </select>
        </Field>
        <Field
          label={cheque ? "Cheque number *" : "Reference"}
          htmlFor="pay-ref"
        >
          <input
            className="in"
            id="pay-ref"
            placeholder={cheque ? "e.g. 001234" : "UTR / transaction no."}
            value={p.reference}
            onChange={(e) => setP({ ...p, reference: e.target.value })}
          />
        </Field>
        {cheque ? (
          <>
            <Field label="Bank" htmlFor="pay-bank">
              <input
                className="in"
                id="pay-bank"
                placeholder="e.g. HDFC Bank, Baner"
                value={p.bank}
                onChange={(e) => setP({ ...p, bank: e.target.value })}
              />
            </Field>
            <Field label="Date on the cheque" htmlFor="pay-chqdate">
              <DateInput
                id="pay-chqdate"
                value={p.chequeDate}
                onChange={(chequeDate) => setP({ ...p, chequeDate })}
              />
            </Field>
          </>
        ) : null}
      </div>
      {cheque ? (
        <div className="note">
          The cheque is kept as <b>In hand</b> and a <b>Deposit cheque</b>{" "}
          reminder goes to To-do on the cheque date. The money counts as
          received once the cheque is marked <b>Cleared</b>.
        </div>
      ) : null}
      {partial ? (
        <Field
          label={`Next payment promised on (balance ${money(Math.round((target.available - amt) * 100) / 100)})`}
          htmlFor="pay-promise"
        >
          <DateInput
            id="pay-promise"
            min={todayIST()}
            value={p.promiseDate}
            onChange={(promiseDate) => setP({ ...p, promiseDate })}
          />
          <span className="small muted">
            Optional. The payment follow-up moves to this date in To-do.
          </span>
        </Field>
      ) : null}
      <Field label="Note" htmlFor="pay-note">
        <input
          className="in"
          id="pay-note"
          placeholder="Optional"
          value={p.note}
          onChange={(e) => setP({ ...p, note: e.target.value })}
        />
      </Field>
      <p className="small muted">
        {target.kind === "invoice"
          ? "A part payment is fine: record each instalment as it comes in. The balance and follow-up update automatically."
          : "The advance is adjusted automatically when this order is invoiced."}
      </p>
    </Modal>
  );
}

function CreditNoteModal({
  row,
  onClose,
}: {
  row: InvoiceRow;
  onClose: () => void;
}) {
  const [v, setV] = useState({ date: todayIST(), amount: "", reason: "" });
  const { pending, run } = useAction();
  return (
    <Modal
      title={`Credit note · ${row.number}`}
      sub={`${row.client.schoolName} · ${money(row.balance)} still due. Use for returned kits, a discount after invoicing, or a small balance written off.`}
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
              run(() => createCreditNote(row.id, v), {
                success: "Credit note created. The balance is reduced.",
                onDone: onClose,
              })
            }
          >
            {pending ? "Saving…" : "Create credit note"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 min-[501px]:grid-cols-2">
        <Field label="Amount (₹) *" htmlFor="cn-amt">
          <input
            className="in"
            id="cn-amt"
            inputMode="decimal"
            value={v.amount}
            onChange={(e) => setV({ ...v, amount: e.target.value })}
          />
        </Field>
        <Field label="Date *" htmlFor="cn-date">
          <DateInput
            id="cn-date"
            value={v.date}
            onChange={(date) => setV({ ...v, date })}
          />
        </Field>
      </div>
      <Field label="Reason *" htmlFor="cn-why">
        <input
          className="in"
          id="cn-why"
          placeholder="e.g. 5 NUR kits returned"
          value={v.reason}
          onChange={(e) => setV({ ...v, reason: e.target.value })}
        />
      </Field>
    </Modal>
  );
}

function SendInvoice({
  row,
  kind,
  contact,
  emailReady,
  me,
  onClose,
}: {
  row: InvoiceRow;
  kind: "invoice" | "reminder";
  contact: Contact;
  emailReady: boolean;
  me: { name: string };
  onClose: () => void;
}) {
  const { pending, run } = useAction();
  const reminder = kind === "reminder";
  const body = reminder
    ? `This is a gentle reminder that ${money(row.balance)} is pending against invoice ${row.number} dated ${dmy(row.date)}${
        row.state === "OVERDUE"
          ? `, which was due on ${dmy(row.dueDate)}`
          : `, due on ${dmy(row.dueDate)}`
      }. Kindly arrange the payment at the earliest. Please ignore this if already paid.`
    : `Please find invoice ${row.number} for ${contact.schoolName}, amount ${money(row.total)}, due on ${dmy(row.dueDate)}.`;
  const sign = `Regards,\n${me.name}\nWonder Learning India Pvt. Ltd.`;
  const [person, setPerson] = useState(() => defaultPerson(contact));
  const [to, setTo] = useState(person.email ?? "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState(
    `Dear Sir/Madam,\n\n${body} The invoice PDF is attached.\n\n${sign}`,
  );
  const mobile = (person.mobile ?? "")
    .replace(/\D/g, "")
    .replace(/^(\d{10})$/, "91$1");

  const whatsapp = () => {
    const link = `${window.location.origin}/i/${row.shareToken}`;
    const text = `Dear Sir/Madam,\n${body}\nInvoice: ${link}\n\n${sign}`;
    openWhatsApp(mobile, text);
    run(() => logInvoiceWhatsApp(row.id, kind), {
      success: reminder
        ? "Reminder logged on the client's activity."
        : "Logged as shared on WhatsApp.",
      onDone: onClose,
    });
  };

  return (
    <Modal
      title={
        reminder ? `Payment reminder · ${row.number}` : `Send ${row.number}`
      }
      sub={`${contact.schoolName} · ${reminder ? `${money(row.balance)} due` : money(row.total)}`}
      wide
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <RecipientPicker
        contact={contact}
        value={person}
        onChange={(p) => {
          setPerson(p);
          setTo(p.email ?? "");
        }}
      />
      <div className="grid grid-cols-1 gap-2 min-[701px]:grid-cols-3">
        <a
          className="btn justify-center"
          href={`/api/invoices/${row.id}/pdf`}
          target="_blank"
          rel="noreferrer"
        >
          Preview PDF
        </a>
        <a
          className="btn justify-center"
          href={`/api/invoices/${row.id}/pdf?download=1`}
        >
          <Icon name="download" size={16} /> Download PDF
        </a>
        <button
          className="btn pri justify-center"
          disabled={pending || !mobile}
          onClick={whatsapp}
        >
          <Icon name="chat" size={16} />{" "}
          {reminder ? "Remind on WhatsApp" : "Share on WhatsApp"}
        </button>
      </div>
      <p className="small muted mt-2">
        WhatsApp opens a message to {person.mobile ?? "nobody (no mobile)"} with
        a private link to the invoice PDF.
      </p>

      <h3 className="mt-4">Email from the CRM</h3>
      {emailReady ? (
        <>
          <div className="fg2 mt-2">
            <Field label="To *" htmlFor="ie-to">
              <input
                className="in"
                id="ie-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="CC" htmlFor="ie-cc">
              <input
                className="in"
                id="ie-cc"
                placeholder="Optional, separate with commas"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Message" htmlFor="ie-msg">
            <textarea
              className="ta min-h-[150px]"
              id="ie-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(() => emailInvoice(row.id, { to, cc, message }, kind), {
                success: `Emailed to ${to} with the PDF attached.`,
                onDone: onClose,
              })
            }
          >
            {pending
              ? "Sending…"
              : reminder
                ? "Email reminder with PDF"
                : "Email invoice with PDF"}
          </button>
        </>
      ) : (
        <div className="note mt-2">
          Email sending isn&apos;t switched on yet. Once your admin connects an
          email account (see DEPLOY.md), you&apos;ll be able to email from here.
          Until then, use WhatsApp or Download above.
        </div>
      )}
    </Modal>
  );
}

/* ---------- payments ---------- */

export function PaymentsPanel({
  client,
  emailReady,
  me,
}: {
  client: ClientDetail;
  emailReady: boolean;
  me: { name: string };
}) {
  const { pending, run } = useAction();
  const { canFinance, userId } = useApp();
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  if (!client.payments.length && !client.creditNotes.length)
    return <div className="small muted">No payments recorded yet.</div>;
  const chequeTone: Record<string, Tone> = {
    IN_HAND: "warn",
    DEPOSITED: "info",
    CLEARED: "ok",
    BOUNCED: "bad",
  };
  return (
    <div className="flex flex-col">
      {client.payments.map((p) => {
        const against = p.invoiceNumber
          ? `invoice ${p.invoiceNumber}`
          : `order ${p.orderNumber} (advance)`;
        const approved = p.approval === "APPROVED";
        const open = approved && (p.status === "IN_HAND" || p.status === "DEPOSITED");
        // Whoever recorded it may remove it while it waits or after a rejection (R36).
        const canDelete = canFinance || (!approved && p.recordedById === userId);
        return (
          <div key={p.id} className="border-b border-line py-2 last:border-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <b
                  className={
                    p.status === "BOUNCED" || p.approval === "REJECTED" ? "text-coral line-through" : ""
                  }
                >
                  {money(p.amount)}
                </b>{" "}
                {p.approval === "PENDING" ? <Pill tone="warn">Awaiting approval</Pill> : null}
                {p.approval === "REJECTED" ? <Pill tone="bad">Rejected</Pill> : null}{" "}
                {approved && p.status !== "RECEIVED" ? (
                  <Pill tone={chequeTone[p.status]}>
                    {PAYMENT_STATUS_LABEL[p.status]}
                  </Pill>
                ) : null}
                <div className="small muted">
                  {p.number ?? (p.approval === "PENDING" ? "Receipt after Accounts approval" : "No receipt")} · {against}
                </div>
                {p.approval === "REJECTED" && p.rejectReason ? <div className="small text-coral">Rejected by Accounts: {p.rejectReason}</div> : null}
                <div className="small muted">
                  {dmy(p.date)} · {p.mode}
                  {p.reference ? ` · ${p.reference}` : ""}
                  {p.bank ? ` · ${p.bank}` : ""}
                  {p.chequeDate ? ` · cheque dated ${dmy(p.chequeDate)}` : ""} ·
                  by {p.recordedBy}
                </div>
                {p.note ? <div className="small">{p.note}</div> : null}
              </div>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {approved && p.number ? (
                <button
                  className="btn sm"
                  onClick={() =>
                    setReceipt({
                      paymentId: p.id,
                      number: p.number!,
                      shareToken: p.shareToken,
                      amount: p.amount,
                      against,
                    })
                  }
                >
                  Receipt
                </button>
              ) : null}
              {approved && p.status === "IN_HAND" ? (
                <button
                  className="btn sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => setChequeStatus(p.id, "DEPOSITED"), {
                      success: "Marked as deposited.",
                    })
                  }
                >
                  Deposited
                </button>
              ) : null}
              {open && canFinance ? (
                <>
                  <button
                    className="btn sm pri"
                    disabled={pending}
                    onClick={() =>
                      run(() => setChequeStatus(p.id, "CLEARED"), {
                        success: "Cheque cleared. Counted as received.",
                      })
                    }
                  >
                    Cleared
                  </button>
                  <button
                    className="btn sm bad"
                    disabled={pending}
                    onClick={() =>
                      confirm(
                        `Mark cheque ${p.reference ?? ""} as bounced? The amount becomes due again.`,
                      ) &&
                      run(() => setChequeStatus(p.id, "BOUNCED"), {
                        success: "Marked as bounced. The amount is due again.",
                      })
                    }
                  >
                    Bounced
                  </button>
                </>
              ) : null}
              {canDelete ? (
                <button
                  className="btn sm ghost"
                  disabled={pending}
                  aria-label={`Delete payment of ${money(p.amount)}`}
                  onClick={() =>
                    confirm(
                      `Delete this payment of ${money(p.amount)}? Only do this if it was recorded by mistake.`,
                    ) &&
                    run(() => deletePayment(p.id), {
                      success: "Payment deleted.",
                    })
                  }
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      {client.creditNotes.length ? (
        <>
          <div className="mt-3 font-semibold">Credit notes</div>
          {client.creditNotes.map((n) => (
            <div
              key={n.id}
              className="flex items-start justify-between gap-2 border-b border-line py-2 last:border-0"
            >
              <div className="min-w-0">
                <b>{money(n.amount)}</b>{" "}
                <span className="small muted">
                  · {n.number} · invoice {n.invoiceNumber}
                </span>
                <div className="small muted">
                  {dmy(n.date)} · {n.reason} · by {n.by}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                <a
                  className="btn sm"
                  href={`/api/credit-notes/${n.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  PDF
                </a>
                {canFinance ? (
                  <button
                    className="btn sm ghost"
                    disabled={pending}
                    onClick={() =>
                      confirm(`Delete credit note ${n.number}?`) &&
                      run(() => deleteCreditNote(n.id), {
                        success: "Credit note deleted.",
                      })
                    }
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </>
      ) : null}
      {receipt ? (
        <SendReceipt
          r={receipt}
          contact={client}
          emailReady={emailReady}
          me={me}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </div>
  );
}

export type ReceiptInfo = {
  paymentId: string;
  number: string;
  shareToken: string;
  amount: number;
  /** e.g. "invoice INV/…" or "order SO/… (advance)". */
  against: string;
  balance?: number;
};

/** Preview / download / WhatsApp / email for one payment receipt. */
export function SendReceipt({
  r,
  contact,
  emailReady,
  me,
  justRecorded,
  onClose,
}: {
  r: ReceiptInfo;
  contact: Contact;
  emailReady: boolean;
  me: { name: string };
  justRecorded?: boolean;
  onClose: () => void;
}) {
  const { pending, run } = useAction();
  const body = `Thank you for your payment of ${money(r.amount)} against ${r.against}. Receipt ${r.number}${
    r.balance === undefined
      ? ""
      : r.balance > 0
        ? `. Balance still due: ${money(r.balance)}`
        : r.against.startsWith("invoice")
          ? ". The invoice is now fully paid"
          : ""
  }.`;
  const sign = `Regards,\n${me.name}\nWonder Learning India Pvt. Ltd.`;
  const [person, setPerson] = useState(() => defaultPerson(contact));
  const [to, setTo] = useState(person.email ?? "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState(
    `Dear Sir/Madam,\n\n${body} The receipt PDF is attached.\n\n${sign}`,
  );
  const mobile = (person.mobile ?? "")
    .replace(/\D/g, "")
    .replace(/^(\d{10})$/, "91$1");
  const pdf = `/api/payments/${r.paymentId}/receipt`;

  const whatsapp = () => {
    const link = `${window.location.origin}/r/${r.shareToken}`;
    const text = `Dear Sir/Madam,\n${body}\nReceipt: ${link}\n\n${sign}`;
    openWhatsApp(mobile, text);
    run(() => logReceiptShared(r.paymentId), {
      success: "Receipt shared on WhatsApp.",
      onDone: onClose,
    });
  };

  return (
    <Modal
      title={
        justRecorded
          ? `Payment saved · send receipt ${r.number}`
          : `Receipt ${r.number}`
      }
      sub={`${contact.schoolName} · ${money(r.amount)} · ${r.against}`}
      wide
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          {justRecorded ? "Not now" : "Close"}
        </button>
      }
    >
      <RecipientPicker
        contact={contact}
        value={person}
        onChange={(p) => {
          setPerson(p);
          setTo(p.email ?? "");
        }}
      />
      <div className="grid grid-cols-1 gap-2 min-[701px]:grid-cols-3">
        <a
          className="btn justify-center"
          href={pdf}
          target="_blank"
          rel="noreferrer"
        >
          Preview PDF
        </a>
        <a className="btn justify-center" href={`${pdf}?download=1`}>
          <Icon name="download" size={16} /> Download PDF
        </a>
        <button
          className="btn pri justify-center"
          disabled={pending || !mobile}
          onClick={whatsapp}
        >
          <Icon name="chat" size={16} /> Send on WhatsApp
        </button>
      </div>
      <p className="small muted mt-2">
        WhatsApp opens a message to {person.mobile ?? "nobody (no mobile)"} with
        a private link to the receipt PDF.
      </p>

      <h3 className="mt-4">Email from the CRM</h3>
      {emailReady ? (
        <>
          <div className="fg2 mt-2">
            <Field label="To *" htmlFor="re-to">
              <input
                className="in"
                id="re-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </Field>
            <Field label="CC" htmlFor="re-cc">
              <input
                className="in"
                id="re-cc"
                placeholder="Optional, separate with commas"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Message" htmlFor="re-msg">
            <textarea
              className="ta min-h-[140px]"
              id="re-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </Field>
          <button
            className="btn pri"
            disabled={pending}
            onClick={() =>
              run(() => emailReceipt(r.paymentId, { to, cc, message }), {
                success: `Receipt emailed to ${to}.`,
                onDone: onClose,
              })
            }
          >
            {pending ? "Sending…" : "Email receipt with PDF"}
          </button>
        </>
      ) : (
        <div className="note mt-2">
          Email sending isn&apos;t switched on yet. Once your admin connects an
          email account (see DEPLOY.md), you&apos;ll be able to email from here.
          Until then, use WhatsApp or Download above.
        </div>
      )}
    </Modal>
  );
}
