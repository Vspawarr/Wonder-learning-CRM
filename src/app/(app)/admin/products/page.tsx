import { db } from "@/lib/db";
import { inr } from "@/lib/format";
import { PageHeader, Pill, Table } from "@/components/ui";
import { requireProductManager } from "@/server/session";
import { ProductButton } from "./product-form";

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
