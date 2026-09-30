import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { PageHeader, Pill, Table } from "@/components/ui";
import { requireSettingsAdmin } from "@/server/session";
import { ProductButton } from "./product-form";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireSettingsAdmin();
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
  const unpriced = rows.filter((r) => r.active && r.price === null).length;

  return (
    <>
      <PageHeader title="Products" sub="What a lead can be interested in and an opportunity can include. Prices feed pipeline values.">
        <ProductButton />
      </PageHeader>
      {unpriced ? <div className="note warn">{unpriced} active product(s) have no price yet, so pipeline values leave them out.</div> : null}
      <Table head={["Code", "Name", "Category", ["Price", "num"], ["GST", "num"], "Status", ""]}>
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
            <td className="num">
              <ProductButton product={p} />
            </td>
          </tr>
        ))}
      </Table>
    </>
  );
}
