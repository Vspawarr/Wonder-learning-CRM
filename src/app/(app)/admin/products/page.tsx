import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { Empty, PageHeader, Pill, Table } from "@/components/ui";
import { requireProductManager } from "@/server/session";
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
    gstRate: p.gstRate === null ? null : Number(p.gstRate),
    active: p.active,
  }));

  return (
    <>
      <PageHeader title="Products" sub="The products offered on quotations. Price and GST here are optional reference values; quotations have MRP and price typed on each one.">
        <ProductButton />
      </PageHeader>
      <div className="hidden min-[901px]:block">
        <Table head={["Code", "Name", "Category", ["Price", "num"], ["GST", "num"], "Status", ""]} empty="No products yet. Add one.">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="faint">{p.code}</td>
              <td>
                <b>{p.name}</b>
              </td>
              <td>{p.category ?? <span className="faint">—</span>}</td>
              <td className="num">{p.price === null ? <span className="faint">Not set</span> : inr(p.price)}</td>
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
              {p.gstRate === null ? "" : ` · GST ${p.gstRate}%`}
            </div>
            <div className="mt-2 flex gap-1.5">
              <ProductButton product={p} />
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
