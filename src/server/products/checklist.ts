// Kit checklists: which kits to print and the PDF itself.
import { db } from "@/lib/db";
import type { KitSection } from "@/lib/quotation-text";
import { renderChecklistPdf, type ChecklistKit } from "./checklist-pdf";

const asSections = (v: unknown): KitSection[] =>
  Array.isArray(v) ? v.filter((x): x is KitSection => !!x && typeof x.title === "string" && Array.isArray(x.items)) : [];

/** Active kits (products with contents), optionally only these ids, in catalogue order. */
export async function checklistKits(ids?: string[]): Promise<ChecklistKit[]> {
  const rows = await db.product.findMany({
    where: { ...(ids?.length ? { id: { in: ids } } : { active: true }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, color: true, contents: true },
  });
  return rows.map((p) => ({ name: p.name, color: p.color, contents: asSections(p.contents) })).filter((k) => k.contents.length);
}

export async function checklistPdf(ids?: string[]) {
  const kits = await checklistKits(ids);
  return kits.length ? renderChecklistPdf(kits) : null;
}

/** For a quotation: the kits it quotes, or every active kit when it quotes none. */
export async function checklistForQuotation(quotationId: string) {
  const items = await db.quotationItem.findMany({ where: { quotationId, productId: { not: null } }, select: { productId: true } });
  const ids = items.map((i) => i.productId!);
  const quoted = ids.length ? await checklistKits(ids) : [];
  return quoted.length ? renderChecklistPdf(quoted) : checklistPdf();
}

export const CHECKLIST_FILE = "Kit-checklist.pdf";
