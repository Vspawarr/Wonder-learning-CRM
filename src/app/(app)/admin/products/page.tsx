import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { Empty, PageHeader, Pill, Table } from "@/components/ui";
import { requireProductManager } from "@/server/session";
import type { KitSection } from "@/lib/quotation-text";
import { Icon } from "@/components/icons";
import { DeleteProductButton, ProductButton } from "./product-form";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireProductManager();
  const products = await db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const rows = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    category: p.category,
    price: p.price === null ? null : Number(p.price),
    mrp: p.mrp === null ? null : Number(p.mrp),
    gstRate: p.gstRate === null ? null : Number(p.gstRate),
    active: p.active,
    contents: Array.isArray(p.contents) ? (p.contents as KitSection[]) : null,
    color: p.color,
  }));
  const kits = rows.filter((p) => p.contents?.length && p.active);
  const count = (p: (typeof rows)[number]) => p.contents?.reduce((t, g) => t + g.items.length, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Products"
        sub="Student kits and optional items from the price list. Adding a product to a quotation fills in its MRP and school price (both can still be changed there). A kit's contents print on the kit checklist."
      >
        {kits.length ? (
          <a className="btn" href="/api/products/checklist" target="_blank" rel="noreferrer">
            <Icon name="doc" size={16} /> Kit checklist (PDF)
          </a>
        ) : null}
        <ProductButton />
      </PageHeader>
      <div className="hidden min-[901px]:block">
        <Table head={["Code", "Name", "Category", ["School price", "num"], ["MRP", "num"], ["GST", "num"], "Status", ""]} empty="No products yet. Add one.">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="faint">{p.code}</td>
              <td>
                <span className="inline-flex items-center gap-2">
                  {p.color ? <span className="inline-block h-3 w-3 rounded-full" style={{ background: p.color }} aria-hidden="true" /> : null}
                  <b>{p.name}</b>
                </span>
                {p.contents?.length ? (
                  <div className="small muted">
                    Kit · {count(p)} items in {p.contents.length} groups ·{" "}
                    <a href={`/api/products/checklist?ids=${p.id}`} target="_blank" rel="noreferrer">
                      checklist
                    </a>
                  </div>
                ) : null}
              </td>
              <td>{p.category ?? <span className="faint">—</span>}</td>
              <td className="num">{p.price === null ? <span className="faint">Not set</span> : inr(p.price)}</td>
              <td className="num">{p.mrp === null ? <span className="faint">—</span> : inr(p.mrp)}</td>
              <td className="num">{p.gstRate === null ? <span className="faint">Not set</span> : `${p.gstRate}%`}</td>
              <td>
                <Pill>{p.active ? "Active" : "Inactive"}</Pill>
              </td>
              <td className="num whitespace-nowrap">
                <span className="inline-flex gap-1.5">
                  <ProductButton product={p} />
                  <DeleteProductButton product={p} />
                </span>
              </td>
            </tr>
          ))}
        </Table>
      </div>
      <div className="flex flex-col gap-2.5 min-[901px]:hidden">
        {rows.map((p) => (
          <div key={p.id} className="card p-3.5">
            <div className="flex items-start justify-between gap-2">
              <b className="min-w-0">{p.name}</b>
              <Pill>{p.active ? "Active" : "Inactive"}</Pill>
            </div>
            <div className="small muted mt-0.5">
              {p.code}
              {p.category ? ` · ${p.category}` : ""} · {p.price === null ? "price not set" : inr(p.price)}
              {p.mrp === null ? "" : ` · MRP ${inr(p.mrp)}`}
              {p.gstRate === null ? "" : ` · GST ${p.gstRate}%`}
              {p.contents?.length ? ` · kit of ${count(p)} items` : ""}
            </div>
            <div className="mt-2 flex gap-1.5">
              <ProductButton product={p} />
              {p.contents?.length ? (
                <a className="btn sm" href={`/api/products/checklist?ids=${p.id}`} target="_blank" rel="noreferrer">
                  Checklist
                </a>
              ) : null}
              <DeleteProductButton product={p} />
            </div>
          </div>
        ))}
        {!rows.length ? (
          <div className="card">
            <Empty>No products yet. Add one.</Empty>
          </div>
        ) : null}
      </div>
    </>
  );
}
