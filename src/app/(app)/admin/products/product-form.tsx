"use client";

import { useState } from "react";
import { Field, Modal, useAction } from "@/components/client";
import { Icon } from "@/components/icons";
import { deleteProduct, saveProduct } from "@/app/actions";

type P = { id: string; name: string; category: string | null; price: number | null; gstRate: number | null; active: boolean };

export function ProductButton({ product }: { product?: P }) {
  const init = () => ({
    name: product?.name ?? "",
    category: product?.category ?? "",
    price: product?.price == null ? "" : String(product.price),
    gstRate: product?.gstRate == null ? "" : String(product.gstRate),
    active: product?.active ?? true,
  });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(init);
  const { pending, run } = useAction();
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
          sub="Changing a price affects new opportunity items only; existing items keep the price they were added at."
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
                <option value="0">Inactive (hidden from new leads)</option>
              </select>
            </Field>
            <Field label="Price (₹, before GST)" htmlFor="p-price">
              <input className="in" id="p-price" type="number" min={0} step="0.01" placeholder="Not set" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} />
            </Field>
            <Field label="GST (%)" htmlFor="p-gst">
              <input className="in" id="p-gst" type="number" min={0} max={100} step="0.01" placeholder="Not set" value={v.gstRate} onChange={(e) => setV({ ...v, gstRate: e.target.value })} />
            </Field>
          </div>
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
