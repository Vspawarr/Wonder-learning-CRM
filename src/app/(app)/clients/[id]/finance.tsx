"use client";

// Client page: sales orders, invoices, payments and reminders.
import { useState } from "react";
import { Field, Modal, Options, useAction } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Pill, type Tone } from "@/components/ui";
import {
  cancelInvoice,
  cancelSalesOrder,
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
import { PAYMENT_MODES } from "@/lib/constants";
import { todayIST } from "@/lib/dates";
import { dmy, inrExact } from "@/lib/format";
import type { InvoiceState } from "@/server/finance/money";
import type { InvoiceRow } from "@/server/finance/service";
import type { ClientDetail, ProductOption } from "@/server/queries";

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
}: {
  client: ClientDetail;
  products: ProductOption[];
}) {
  const { pending, run } = useAction();
  const [choosing, setChoosing] = useState<
    { id: string; label: string }[] | null
  >(null);
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: OrderDraft;
  } | null>(null);
  const [delivering, setDelivering] = useState<SO | null>(null);
  const [poFor, setPoFor] = useState<SO | null>(null);
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
                  {so.notes ? (
                    <div className="small mt-1 whitespace-pre-line">
                      {so.notes}
                    </div>
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
                    <button className="btn sm" onClick={() => setPoFor(so)}>
                      <Icon name="upload" size={14} />{" "}
                      {so.poNumber ? "PO" : "Add PO"}
                    </button>
                    {so.status === "CONFIRMED" ? (
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
        onDone: onClose,
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
                  onDone: onClose,
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

export type Contact = {
  schoolName: string;
  mobile: string;
  email: string | null;
};

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
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [sending, setSending] = useState<"invoice" | "reminder" | null>(null);
  const { pending, run } = useAction();
  const live = row.state !== "CANCELLED";
  const owed = live && row.balance > 0;
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
          <button className="btn sm pri" onClick={() => setPaying(true)}>
            Record payment
          </button>
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
      {live && !compact && row.paid === 0 ? (
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
          row={row}
          onClose={() => setPaying(false)}
          onSaved={(r) => {
            setPaying(false);
            setReceipt({ ...r, invoiceNumber: row.number });
          }}
        />
      ) : null}
      {receipt ? (
        <SendReceipt
          r={receipt}
          contact={contact}
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
          contact={contact}
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

function PaymentModal({
  row,
  onClose,
  onSaved,
}: {
  row: InvoiceRow;
  onClose: () => void;
  onSaved: (r: {
    paymentId: string;
    number: string;
    shareToken: string;
    amount: number;
    balance: number;
  }) => void;
}) {
  const [p, setP] = useState({
    amount: String(row.balance),
    date: todayIST(),
    mode: "",
    reference: "",
    note: "",
  });
  const { pending, run } = useAction();
  return (
    <Modal
      title={`Record payment · ${row.number}`}
      sub={`${row.client.schoolName} · ${money(row.balance)} still due of ${money(row.total)}`}
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
              run(() => recordPayment(row.id, p), {
                success: "Payment recorded. Receipt ready to send.",
                onDone: (r) =>
                  r
                    ? onSaved({
                        paymentId: r.paymentId,
                        number: r.receiptNumber,
                        shareToken: r.shareToken,
                        amount: r.amount,
                        balance: r.balance,
                      })
                    : onClose(),
              })
            }
          >
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
        <Field label="Reference" htmlFor="pay-ref">
          <input
            className="in"
            id="pay-ref"
            placeholder="UTR / cheque no."
            value={p.reference}
            onChange={(e) => setP({ ...p, reference: e.target.value })}
          />
        </Field>
      </div>
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
        A part payment is fine: record each instalment as it comes in. The
        balance and follow-up update automatically.
      </p>
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
  const [to, setTo] = useState(contact.email ?? "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState(
    `Dear Sir/Madam,\n\n${body} The invoice PDF is attached.\n\n${sign}`,
  );
  const mobile = contact.mobile
    .replace(/\D/g, "")
    .replace(/^(\d{10})$/, "91$1");

  const whatsapp = () => {
    const link = `${window.location.origin}/i/${row.shareToken}`;
    const text = `Dear Sir/Madam,\n${body}\nInvoice: ${link}\n\n${sign}`;
    window.open(
      `https://wa.me/${mobile}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
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
        WhatsApp opens a message to {contact.mobile} with a private link to the
        invoice PDF.
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
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  if (!client.payments.length)
    return <div className="small muted">No payments recorded yet.</div>;
  return (
    <div className="flex flex-col">
      {client.payments.map((p) => (
        <div
          key={p.id}
          className="flex items-start justify-between gap-2 border-b border-line py-2 last:border-0"
        >
          <div className="min-w-0">
            <b>{money(p.amount)}</b>{" "}
            <span className="small muted">
              · {p.invoiceNumber} · {p.number}
            </span>
            <div className="small muted">
              {dmy(p.date)} · {p.mode}
              {p.reference ? ` · ${p.reference}` : ""} · by {p.recordedBy}
            </div>
            {p.note ? <div className="small">{p.note}</div> : null}
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              className="btn sm"
              onClick={() =>
                setReceipt({
                  paymentId: p.id,
                  number: p.number,
                  shareToken: p.shareToken,
                  amount: p.amount,
                  invoiceNumber: p.invoiceNumber,
                })
              }
            >
              Receipt
            </button>
            <button
              className="btn sm ghost"
              disabled={pending}
              aria-label={`Delete payment of ${money(p.amount)}`}
              onClick={() =>
                confirm(
                  `Delete this payment of ${money(p.amount)}? Only do this if it was recorded by mistake.`,
                ) &&
                run(() => deletePayment(p.id), { success: "Payment deleted." })
              }
            >
              Delete
            </button>
          </div>
        </div>
      ))}
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

type ReceiptInfo = {
  paymentId: string;
  number: string;
  shareToken: string;
  amount: number;
  invoiceNumber: string;
  balance?: number;
};

/** Preview / download / WhatsApp / email for one payment receipt. */
function SendReceipt({
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
  const body = `Thank you for your payment of ${money(r.amount)} against invoice ${r.invoiceNumber}. Receipt ${r.number}${
    r.balance === undefined
      ? ""
      : r.balance > 0
        ? `. Balance still due: ${money(r.balance)}`
        : ". The invoice is now fully paid"
  }.`;
  const sign = `Regards,\n${me.name}\nWonder Learning India Pvt. Ltd.`;
  const [to, setTo] = useState(contact.email ?? "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState(
    `Dear Sir/Madam,\n\n${body} The receipt PDF is attached.\n\n${sign}`,
  );
  const mobile = contact.mobile
    .replace(/\D/g, "")
    .replace(/^(\d{10})$/, "91$1");
  const pdf = `/api/payments/${r.paymentId}/receipt`;

  const whatsapp = () => {
    const link = `${window.location.origin}/r/${r.shareToken}`;
    const text = `Dear Sir/Madam,\n${body}\nReceipt: ${link}\n\n${sign}`;
    window.open(
      `https://wa.me/${mobile}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
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
      sub={`${contact.schoolName} · ${money(r.amount)} · ${r.invoiceNumber}`}
      wide
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>
          {justRecorded ? "Not now" : "Close"}
        </button>
      }
    >
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
        WhatsApp opens a message to {contact.mobile} with a private link to the
        receipt PDF.
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
