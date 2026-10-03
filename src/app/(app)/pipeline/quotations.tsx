"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Field, Modal, Options, useAction, useToast } from "@/components/client";
import { DateInput } from "@/components/date-input";
import { Icon } from "@/components/icons";
import { Pill } from "@/components/ui";
import { useApp } from "@/components/app-context";
import {
  createQuotation,
  deleteQuotation,
  emailQuotation,
  markQuotationSent,
  quotationDefaults,
  quotationForEdit,
  reviseQuotation,
  updateQuotation,
  poTemplateSetup,
  savePoTemplate,
} from "@/app/actions";
import { fmtDate, istDate, todayIST } from "@/lib/dates";
import { customDelta, customLabel, isCustomised, type KitCustom } from "@/lib/kit-custom";
import type { ProductOption, QuoteSummary } from "@/server/queries";
import type { QuoteParent } from "@/server/quotation/service";

type Q = QuoteSummary;
/** What the panel needs to know about the deal or client it quotes for. */
export type QuoteTarget = {
  parent: QuoteParent;
  schoolName: string;
  closed: boolean;
  /** Opportunity stage, when quoting on a deal (sending can move it to Proposal Sent). */
  stage: string | null;
  email: string | null;
  mobile: string | null;
  quotations: Q[];
};
type Line = {
  productId: string | null;
  description: string;
  mrp: string;
  /** Per kit before transport. */
  price: string;
  /** Hidden transport per kit for the school's location; added into the price, never printed. */
  transport: string;
  kit: KitCustom | null;
};
type Draft = {
  date: string;
  validityDays: string;
  toLine: string;
  schoolName: string;
  address: string;
  items: Line[];
};

const VIA: Record<string, string> = {
  download: "downloaded",
  whatsapp: "WhatsApp",
  email: "email",
};

export function QuotationsPanel({
  target: opp,
  products,
  emailReady,
  me,
  heading = true,
}: {
  target: QuoteTarget;
  heading?: boolean;
  products: ProductOption[];
  emailReady: boolean;
  me: { name: string };
}) {
  const [editing, setEditing] = useState<{
    id: string | null;
    draft: Draft;
  } | null>(null);
  const [sending, setSending] = useState<Q | null>(null);
  const [poFor, setPoFor] = useState<Q | null>(null);
  const { pending, run } = useAction();
  const today = todayIST();
  const { features } = useApp();

  const startNew = () =>
    run(() => quotationDefaults(opp.parent), {
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
            items: d.items,
          },
        }),
    });

  const editDraft = (q: Q) =>
    run(() => quotationForEdit(q.id), {
      onDone: (d) => d && setEditing({ id: q.id, draft: d }),
    });

  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading ? <h3>Quotations</h3> : <span />}
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
                  <b>{q.number}</b> <Pill tone={q.status === "SENT" ? "ok" : "mute"}>{q.status === "SENT" ? "Sent" : "Draft"}</Pill>{" "}
                  {features.quoteExpiry && q.expired ? <Pill tone="bad">Expired</Pill> : null}
                  <div className="small muted">
                    Created {q.createdAt} · {q.lines} product
                    {q.lines === 1 ? "" : "s"} · {q.preparedBy}
                    {features.quoteExpiry ? ` · valid till ${q.validUntil.split("-").reverse().join("/")}` : ""}
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
                        onClick={() =>
                          confirm(`Delete draft ${q.number}?`) &&
                          run(() => deleteQuotation(q.id), {
                            success: "Draft deleted.",
                          })
                        }
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
                      <button className="btn sm pri" onClick={() => setPoFor(q)}>
                        Send PO template
                      </button>
                      {!opp.closed ? (
                        <button
                          className="btn sm"
                          disabled={pending}
                          onClick={() =>
                            run(() => reviseQuotation(q.id), {
                              success: "New draft created from this quotation.",
                            })
                          }
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
        <QuotationEditor parent={opp.parent} id={editing.id} initial={editing.draft} products={products} me={me} onClose={() => setEditing(null)} />
      ) : null}
      {poFor ? <PoTemplateModal q={poFor} target={opp} me={me} onClose={() => setPoFor(null)} /> : null}
      {sending ? <SendQuotation q={sending} opp={opp} emailReady={emailReady} me={me} onClose={() => setSending(null)} /> : null}
    </div>
  );
}

function QuotationEditor({
  parent,
  id,
  initial,
  products,
  me,
  onClose,
}: {
  parent: QuoteParent;
  id: string | null;
  initial: Draft;
  products: ProductOption[];
  me: { name: string };
  onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [add, setAdd] = useState("");
  const { pending, run } = useAction();
  const setItem = (i: number, patch: Partial<Line>) =>
    setD({
      ...d,
      items: d.items.map((x, j) => (j === i ? { ...x, ...patch } : x)),
    });
  const addable = products.filter((p) => p.active);
  const byId = new Map(products.map((p) => [p.id, p]));
  // Optional items that can go into a kit: priced products that aren't kits themselves.
  const extras = addable.filter((p) => !p.contents && p.price != null);
  const [openKit, setOpenKit] = useState<number | null>(null);

  /** Changing a kit's items moves its MRP and price by those items' prices (a hand-typed price keeps its difference). */
  const changeKit = (i: number, next: KitCustom) => {
    const it = d.items[i];
    const p = it.productId ? byId.get(it.productId) : undefined;
    if (!p) return;
    const sections = p.contents ?? [];
    const before = customDelta(sections, it.kit);
    const after = customDelta(sections, next);
    const adj = (v: string, k: "sp" | "mrp") =>
      v.trim() === "" || !Number.isFinite(Number(v)) ? v : String(Math.round((Number(v) - before[k] + after[k]) * 100) / 100);
    setItem(i, {
      kit: isCustomised(next) ? next : null,
      price: adj(it.price, "sp"),
      mrp: adj(it.mrp, "mrp"),
      // Keep the line text in step unless someone has rewritten it.
      description: it.description === customLabel(p.name, it.kit) ? customLabel(p.name, next) : it.description,
    });
  };

  const save = () =>
    run(() => (id ? updateQuotation(id, d) : createQuotation(parent, d)) as Promise<{ ok: true } | { ok: false; error: string }>, {
      success: id ? "Quotation saved." : "Quotation created as a draft. Use “Send quotation” when ready.",
      onDone: onClose,
    });

  return (
    <Modal
      title={id ? "Edit quotation" : "Create quotation"}
      sub={`Prepared by ${me.name}. MRP and price fill in from Settings → Products and can be changed. Transport is added into the price and never printed.`}
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
            <input
              className="in"
              id="q-valid"
              type="number"
              min={1}
              value={d.validityDays}
              onChange={(e) => setD({ ...d, validityDays: e.target.value })}
            />
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
            <LineExtras
              n={i + 1}
              line={it}
              product={it.productId ? byId.get(it.productId) : undefined}
              extras={extras}
              open={openKit === i}
              onToggle={() => setOpenKit(openKit === i ? null : i)}
              onTransport={(transport) => setItem(i, { transport })}
              onKit={(next) => changeKit(i, next)}
            />
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
            setD({
              ...d,
              // Prefill from the price list (Settings → Products); both stay editable.
              items: [
                ...d.items,
                { productId: p.id, description: p.name, mrp: p.mrp == null ? "" : String(p.mrp), price: p.price == null ? "" : String(p.price), transport: "", kit: null },
              ],
            });
            setAdd("");
          }}
        >
          Add
        </button>
      </div>
      <p className="small muted mt-2">
        Products come from Settings → Products. The description can be edited for this quotation. Add transport on the line(s) you choose: the
        school only sees the total price.
      </p>
    </Modal>
  );
}

const rs = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN")}`;

/** Under each quotation line: the hidden transport, and for kits, taking items out / adding optional items. */
function LineExtras({
  n,
  line,
  product,
  extras,
  open,
  onToggle,
  onTransport,
  onKit,
}: {
  n: number;
  line: Line;
  product: ProductOption | undefined;
  extras: ProductOption[];
  open: boolean;
  onToggle: () => void;
  onTransport: (v: string) => void;
  onKit: (next: KitCustom) => void;
}) {
  const [pick, setPick] = useState("");
  const kit = line.kit ?? { removed: [], added: [] };
  const sections = product?.contents ?? null;
  const price = Number(line.price);
  const transport = Number(line.transport || 0);
  const shown = line.price.trim() !== "" && Number.isFinite(price) && Number.isFinite(transport) ? price + transport : null;
  const changes = [kit.removed.length ? `${kit.removed.length} taken out` : "", kit.added.length ? `${kit.added.length} added` : ""].filter(Boolean).join(", ");
  const groups = [...new Set(extras.map((p) => p.category ?? "Other"))];
  const toggleItem = (name: string, keep: boolean) =>
    onKit({ ...kit, removed: keep ? kit.removed.filter((x) => x !== name) : [...kit.removed, name] });

  return (
    <div className="col-span-2 flex flex-col gap-2 min-[701px]:col-span-5 min-[701px]:mb-1 min-[701px]:pl-[36px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="small flex items-center gap-2 text-ink3" htmlFor={`q-tr-${n}`}>
          Transport / kit (hidden)
          <input
            className="in w-24 text-right"
            id={`q-tr-${n}`}
            inputMode="decimal"
            placeholder="₹0"
            value={line.transport}
            onChange={(e) => onTransport(e.target.value)}
          />
        </label>
        {shown != null && transport > 0 ? <span className="small muted">School sees {rs(shown)} per kit</span> : null}
        {sections ? (
          <button className="btn sm" aria-expanded={open} onClick={onToggle}>
            <Icon name="box" size={14} /> Change kit items{changes ? ` · ${changes}` : ""}
          </button>
        ) : null}
      </div>
      {sections && open ? (
        <div className="rounded-lg border border-line bg-surf2 p-3">
          <p className="small muted">Untick an item to take it out of this school&apos;s kit; add optional items below. MRP and price change by the item&apos;s price.</p>
          <div className="mt-2 grid grid-cols-1 gap-x-6 min-[701px]:grid-cols-2">
            {sections.map((g, gi) => (
              <div key={gi} className="mt-1">
                <div className="small font-semibold">{g.title.split(" | ")[0]}</div>
                {g.items.map((item, ii) => {
                  const p = g.prices?.[ii];
                  const keep = !kit.removed.includes(item);
                  return (
                    <label key={ii} className="flex min-h-[34px] items-center gap-2 border-b border-line py-1 last:border-0">
                      <input type="checkbox" className="h-[18px] w-[18px] shrink-0" checked={keep} onChange={(e) => toggleItem(item, e.target.checked)} />
                      <span className={`min-w-0 flex-1 ${keep ? "" : "faint line-through"}`}>{item}</span>
                      <span className="small muted whitespace-nowrap">{p ? rs(p.sp) : "no price"}</span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 small font-semibold">Optional items added</div>
          {kit.added.length ? (
            kit.added.map((a, ai) => (
              <div key={ai} className="flex min-h-[34px] items-center gap-2 border-b border-line py-1 last:border-0">
                <span className="min-w-0 flex-1">{a.name}</span>
                <span className="small muted whitespace-nowrap">{rs(a.sp)}</span>
                <button className="btn ghost sm px-1" aria-label={`Take ${a.name} out`} onClick={() => onKit({ ...kit, added: kit.added.filter((_, j) => j !== ai) })}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))
          ) : (
            <div className="small faint">None.</div>
          )}
          <div className="mt-2 flex gap-2">
            <select className="sel" aria-label={`Optional item for line ${n}`} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose an optional item…</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {extras
                    .filter((p) => (p.category ?? "Other") === g)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {rs(p.price!)}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <button
              className="btn"
              disabled={!pick}
              onClick={() => {
                const p = extras.find((x) => x.id === pick)!;
                onKit({ ...kit, added: [...kit.added, { productId: p.id, name: p.name, sp: p.price!, mrp: p.mrp ?? 0 }] });
                setPick("");
              }}
            >
              Add
            </button>
          </div>
        </div>
      ) : null}
    </div>
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
  opp: QuoteTarget;
  emailReady: boolean;
  me: { name: string };
  onClose: () => void;
}) {
  const toast = useToast();
  const { pending, run } = useAction();
  const [to, setTo] = useState(opp.email ?? "");
  const [cc, setCc] = useState("");
  const [message, setMessage] = useState(
    `Dear Sir/Madam,\n\nPlease find attached our quotation ${q.number} for ${opp.schoolName}.\n\nWe look forward to working with you.\n\nRegards,\n${me.name}\nWonder Learning India Pvt. Ltd.`,
  );
  const mobile = (opp.mobile ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "91$1");

  const whatsapp = () => {
    const link = `${window.location.origin}/q/${q.shareToken}`;
    const text = `Dear Sir/Madam,\nPlease find our quotation ${q.number} for ${opp.schoolName}:\n${link}\n\nRegards,\n${me.name}\nWonder Learning`;
    // Open straight away (inside the click) so the browser doesn't block it.
    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    run(() => markQuotationSent(q.id, "whatsapp"), {
      success: `${q.number} marked as sent on WhatsApp.`,
      onDone: onClose,
    });
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = `/api/quotations/${q.id}/pdf?download=1`;
    a.click();
    run(() => markQuotationSent(q.id, "download"), {
      success: `${q.number} downloaded and marked as sent.`,
      onDone: onClose,
    });
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
        <button className="btn justify-center" disabled={pending || !mobile} onClick={whatsapp} title={mobile ? "" : "No mobile number on record"}>
          <Icon name="chat" size={16} /> Share on WhatsApp
        </button>
      </div>
      <p className="small muted mt-2">
        WhatsApp opens a message to {opp.mobile ?? "the school"} with a private link to the PDF. Download saves the PDF so you can attach it yourself.
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

/** The PO template in Wonder Learning's PO format, pre-filled from the quotation for the school to sign and stamp. */
export function PoTemplateModal({ q, target, me, onClose }: { q: Q; target: QuoteTarget; me: { name: string }; onClose: () => void }) {
  const router = useRouter();
  const d0 = q.poDetails;
  const [setup, setSetup] = useState<{ customise: string[]; shippingTerms: string } | null>(null);
  const [v, setV] = useState(() => ({
    kits: q.itemNames.map((_, i) => (d0?.kits?.[i] ? String(d0.kits[i]) : "")),
    requisitioner: d0?.requisitioner ?? "",
    deliveryDate: d0?.deliveryDate ?? "",
    shipVia: d0?.shipVia ?? "",
    shippingTerms: d0?.shippingTerms ?? "",
    remarks: (d0?.remarks ?? []).join("\n"),
    customise: d0?.customise ?? [],
    cheques: (d0?.cheques?.length ? d0.cheques : [{ mode: "CDC", date: null, amount: null }]).map((c) => ({
      mode: c.mode,
      date: c.date ?? "",
      amount: c.amount == null ? "" : String(c.amount),
    })),
  }));
  const [poNumber, setPoNumber] = useState(q.poNumber);
  const [saved, setSaved] = useState(!!q.poNumber);
  const { pending, run } = useAction();
  useEffect(() => {
    let live = true;
    poTemplateSetup().then((x) => {
      if (!live) return;
      setSetup(x);
      setV((cur) => ({
        ...cur,
        shippingTerms: cur.shippingTerms || x.shippingTerms,
        customise: x.customise.map((_, i) => cur.customise[i] ?? true),
      }));
    });
    return () => {
      live = false;
    };
  }, []);
  const edit = (patch: Partial<typeof v>) => {
    setV({ ...v, ...patch });
    setSaved(false);
  };
  const save = () =>
    run(
      () =>
        savePoTemplate(q.id, {
          kits: v.kits.map((k) => (k.trim() ? k.trim() : null)),
          requisitioner: v.requisitioner,
          deliveryDate: v.deliveryDate || null,
          shipVia: v.shipVia,
          shippingTerms: v.shippingTerms,
          remarks: v.remarks.split("\n").map((r) => r.trim()).filter(Boolean),
          customise: v.customise,
          cheques: v.cheques.filter((c) => c.mode || c.date || c.amount).map((c) => ({ mode: c.mode, date: c.date || null, amount: c.amount ? c.amount : null })),
        }),
      {
        success: "PO template saved.",
        onDone: (n) => {
          setPoNumber(n ?? poNumber);
          setSaved(true);
          router.refresh();
        },
      },
    );
  const pdf = `/api/quotations/${q.id}/po-template`;
  const mobile = (target.mobile ?? "").replace(/\D/g, "").replace(/^(\d{10})$/, "91$1");
  const whatsapp = () => {
    const base = `${window.location.origin}/q/${q.shareToken}`;
    const text = `Dear Sir/Madam,\nAs discussed, here is purchase order ${poNumber ?? ""} for ${target.schoolName} against our quotation ${q.number}. Please check the quantities, sign, put the school stamp and send it back to us:\n${base}/po\n\nKit checklist (what each kit contains):\n${base}/checklist\n\nRegards,\n${me.name}\nWonder Learning`;
    window.open(`https://wa.me/${mobile}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const setCheque = (i: number, patch: Partial<(typeof v.cheques)[number]>) => edit({ cheques: v.cheques.map((c, j) => (j === i ? { ...c, ...patch } : c)) });

  return (
    <Modal
      title={`Send PO template · ${q.number}`}
      sub={`Our purchase order format in ${target.schoolName}'s name, for them to sign, stamp and send back. ${poNumber ? `PO No. ${poNumber}` : "The PO number is given when you save."}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn pri" disabled={pending} onClick={save}>
            {pending ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </>
      }
    >
      <h3>Quantities (kits demanded)</h3>
      <p className="small muted">Leave blank for the school to fill in by hand.</p>
      <div className="mt-2 flex flex-col gap-2">
        {q.itemNames.map((name, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_96px] items-center gap-2">
            <label className="min-w-0 truncate" htmlFor={`pot-${i}`}>
              {name}
            </label>
            <input
              className="in text-right"
              id={`pot-${i}`}
              inputMode="numeric"
              placeholder="Kits"
              value={v.kits[i]}
              onChange={(e) => edit({ kits: v.kits.map((k, j) => (j === i ? e.target.value : k)) })}
            />
          </div>
        ))}
      </div>
      <h3 className="mt-4">Order details</h3>
      <div className="fg2 mt-2">
        <Field label="Requisitioner" htmlFor="pot-req">
          <input className="in" id="pot-req" placeholder="School contact person" value={v.requisitioner} onChange={(e) => edit({ requisitioner: e.target.value })} />
        </Field>
        <Field label="Expected delivery date" htmlFor="pot-del">
          <DateInput id="pot-del" value={v.deliveryDate} onChange={(deliveryDate) => edit({ deliveryDate })} />
        </Field>
        <Field label="Ship via" htmlFor="pot-via">
          <input className="in" id="pot-via" placeholder="Transporter (optional)" value={v.shipVia} onChange={(e) => edit({ shipVia: e.target.value })} />
        </Field>
        <Field label="Shipping terms" htmlFor="pot-terms">
          <input className="in" id="pot-terms" value={v.shippingTerms} onChange={(e) => edit({ shippingTerms: e.target.value })} />
        </Field>
      </div>
      <Field label="Additional remarks (one per line)" htmlFor="pot-rem">
        <textarea
          className="ta"
          id="pot-rem"
          rows={3}
          placeholder={"School will be served with customised stuff\nAdd Hindi Swar TB, NB in LKG"}
          value={v.remarks}
          onChange={(e) => edit({ remarks: e.target.value })}
        />
      </Field>
      <h3 className="mt-2">Customised with school name &amp; logo</h3>
      <div className="mt-2 flex flex-col gap-1.5">
        {(setup?.customise ?? []).map((label, i) => (
          <label key={i} className="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-0">
            <span className="min-w-0">{label}</span>
            <span className="flex items-center gap-2 whitespace-nowrap">
              <span className={`small ${v.customise[i] ? "text-mint" : "faint"}`}>{v.customise[i] ? "YES" : "NO"}</span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={!!v.customise[i]}
                onChange={(e) => edit({ customise: v.customise.map((c, j) => (j === i ? e.target.checked : c)) })}
              />
            </span>
          </label>
        ))}
      </div>
      <h3 className="mt-4">Advance cheque / DD details</h3>
      <div className="mt-2 flex flex-col gap-2">
        {v.cheques.map((c, i) => (
          <div key={i} className="grid grid-cols-[96px_minmax(0,1fr)_110px_32px] items-center gap-2 max-[480px]:grid-cols-[84px_minmax(0,1fr)_92px_28px]">
            <select className="sel" aria-label="Payment type" value={c.mode} onChange={(e) => setCheque(i, { mode: e.target.value })}>
              {["CDC", "PDC", "DD", "NEFT"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <DateInput ariaLabel="Dated" value={c.date} onChange={(date) => setCheque(i, { date })} />
            <input className="in text-right" aria-label="Amount" inputMode="decimal" placeholder="₹" value={c.amount} onChange={(e) => setCheque(i, { amount: e.target.value })} />
            <button className="btn ghost sm px-1" aria-label="Remove row" onClick={() => edit({ cheques: v.cheques.filter((_, j) => j !== i) })}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
        {v.cheques.length < 4 ? (
          <button className="btn sm self-start" onClick={() => edit({ cheques: [...v.cheques, { mode: "PDC", date: "", amount: "" }] })}>
            <Icon name="plus" size={14} /> Add cheque
          </button>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 min-[501px]:grid-cols-3">
        <a className={`btn justify-center ${saved ? "" : "pointer-events-none opacity-45"}`} aria-disabled={!saved} href={pdf} target="_blank" rel="noreferrer">
          Preview
        </a>
        <a className={`btn justify-center ${saved ? "" : "pointer-events-none opacity-45"}`} aria-disabled={!saved} href={`${pdf}?download=1`}>
          <Icon name="download" size={16} /> Download
        </a>
        <button className="btn pri justify-center" disabled={!saved || !mobile} onClick={whatsapp}>
          <Icon name="chat" size={16} /> WhatsApp
        </button>
      </div>
      <p className="small muted mt-3">
        {saved ? "Saved. " : "Save first, then preview or send. "}
        The kit checklist goes with the WhatsApp message. When the signed PO comes back, use Upload signed PO: the PO number is filled in for you.
      </p>
    </Modal>
  );
}
