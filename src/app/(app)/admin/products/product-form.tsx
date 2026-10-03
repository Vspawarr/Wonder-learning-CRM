"use client";

import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { deleteProduct, saveProduct } from "@/app/actions";
import { itemsTotal, sectionsToText, textToSections, type KitSection } from "@/lib/quotation-text";

type P = {
  id: string;
  name: string;
  category: string | null;
  price: number | null;
  mrp: number | null;
  gstRate: number | null;
  active: boolean;
  contents: KitSection[] | null;
  color: string | null;
};

export function ProductButton({ product }: { product?: P }) {
  const init = () => ({
    name: product?.name ?? "",
    category: product?.category ?? "",
    price: product?.price == null ? "" : String(product.price),
    mrp: product?.mrp == null ? "" : String(product.mrp),
    gstRate: product?.gstRate == null ? "" : String(product.gstRate),
    active: product?.active ?? true,
    contents: product?.contents ? sectionsToText(product.contents) : "",
    color: product?.color ?? "",
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(init);
  const { pending, run } = useAction();
  const sum = open ? itemsTotal(textToSections(v.contents)) : null;
  const close = () => setOpen(false);
  const show = () => {
    setV(init());
    setOpen(true);
  };
  return (
    <>
      {product ? (
        <button className="btn sm" onClick={show}>
          Edit
        </button>
      ) : (
        <button className="btn pri" onClick={show}>
          <Icon name="plus" size={16} /> Add product
        </button>
      )}
      {open ? (
        <Modal
          title={product ? `Edit ${product.name}` : "Add product"}
          sub="Prices fill in new quotations; quotations, orders and invoices already made keep their own prices."
          onClose={close}
          footer={
            <>
              <button className="btn" onClick={close}>
                Cancel
              </button>
              <button className="btn pri" disabled={pending} onClick={() => run(() => saveProduct(product?.id ?? null, v), { success: "Product saved.", onDone: close })}>
                Save
              </button>
            </>
          }
        >
          <Field label="Name *" htmlFor="p-name">
            <input className="in" id="p-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <div className="fg2">
            <Field label="Category" htmlFor="p-cat">
              <input className="in" id="p-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} />
            </Field>
            <Field label="Status" htmlFor="p-active">
              <select className="sel" id="p-active" value={v.active ? "1" : "0"} onChange={(e) => setV({ ...v, active: e.target.value === "1" })}>
                <option value="1">Active</option>
                <option value="0">Inactive (hidden from new quotations)</option>
              </select>
            </Field>
            <Field label="MRP (₹)" htmlFor="p-mrp">
              <input className="in" id="p-mrp" type="number" min={0} step="0.01" placeholder="Not set" value={v.mrp} onChange={(e) => setV({ ...v, mrp: e.target.value })} />
            </Field>
            <Field label="School price (₹, before GST)" htmlFor="p-price">
              <input className="in" id="p-price" type="number" min={0} step="0.01" placeholder="Not set" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
            </Field>
            <Field label="GST (%)" htmlFor="p-gst">
              <input className="in" id="p-gst" type="number" min={0} max={100} step="0.01" placeholder="Not set" value={v.gstRate} onChange={(e) => setV({ ...v, gstRate: e.target.value })} />
            </Field>
          </div>
          <Field label="Kit contents (for kits only)" htmlFor="p-contents">
            <textarea
              className="ta font-mono text-[13px]"
              id="p-contents"
              rows={10}
              placeholder={"## Common Kit | 19 objects\nSchool Bag\nStudent's Diary\n\n## Academic Kit | 10 Text Books\nText Book- 1"}
              value={v.contents}
              onChange={(e) => setV({ ...v, contents: e.target.value })}
            />
            <span className="small muted">
              Start each group with ## and its name; anything after &quot; | &quot; prints under the name (e.g. 19 objects). Then one item per
              line, optionally with its school price and MRP: <code>Book 1 to 9 | 1792 | 2688</code>. Item prices let a quotation take items out
              of the kit. This prints on the kit checklist (without prices). Leave empty for optional items and services.
            </span>
            {sum ? (
              <span className={`small block ${v.price && Number(v.price) !== sum.sp ? "text-coral" : "muted"}`}>
                Items add up to ₹{sum.sp.toLocaleString("en-IN")} (MRP ₹{sum.mrp.toLocaleString("en-IN")})
                {v.price && Number(v.price) !== sum.sp ? ", which is not the school price above" : ""}.
              </span>
            ) : null}
          </Field>
          <Field label="Checklist colour" htmlFor="p-color">
            <span className="flex items-center gap-2">
              <input
                type="color"
                id="p-color"
                className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surf"
                value={v.color || "#3d3ba8"}
                onChange={(e) => setV({ ...v, color: e.target.value })}
              />
              <span className="small muted">{v.color ? v.color : "Default (purple)"}</span>
            </span>
          </Field>
        </Modal>
      ) : null}
    </>
  );
}

export function DeleteProductButton({ product }: { product: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useAction();
  return (
    <>
      <button className="btn sm ghost" onClick={() => setOpen(true)} aria-label={`Delete ${product.name}`}>
        Delete
      </button>
      {open ? (
        <Modal
          title={`Delete ${product.name}?`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                className="btn bad"
                disabled={pending}
                onClick={() => run(() => deleteProduct(product.id), { success: `${product.name} deleted.`, onDone: () => setOpen(false) })}
              >
                {pending ? "Deleting…" : "Delete product"}
              </button>
            </>
          }
        >
          <p>It will no longer appear in product lists.</p>
          <p className="small muted mt-2">
            Quotations, sales orders and invoices that already include it are not changed. If you may sell it again later, use Edit →
            Inactive instead.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
