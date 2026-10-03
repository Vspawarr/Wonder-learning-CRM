// Plain-text editing format for kit sections, shared by the Settings screens and the server.
// "## Heading" starts a section; each other line is an item. On a product's kit contents an item may
// end with its price: "Book 1 to 9 | 1792 | 2688" (school price, then MRP), used to customise kits.

export type ItemPrice = { sp: number; mrp: number };
export type KitSection = {
  title: string;
  items: string[];
  /** Same order as items; null where an item has no price. Absent when no item is priced. */
  prices?: (ItemPrice | null)[];
};

const num = (n: number) => String(Math.round(n * 100) / 100);
const PRICED = /^(.*?)\s*\|\s*(\d+(?:\.\d+)?)\s*(?:\|\s*(\d+(?:\.\d+)?)\s*)?$/;

export const sectionsToText = (s: KitSection[]) =>
  s
    .map((x) =>
      [`## ${x.title}`, ...x.items.map((it, i) => (x.prices?.[i] ? `${it} | ${num(x.prices[i]!.sp)} | ${num(x.prices[i]!.mrp)}` : it))].join("\n"),
    )
    .join("\n\n");

export function textToSections(text: string): KitSection[] {
  const out: KitSection[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("##")) {
      out.push({ title: line.replace(/^#+\s*/, ""), items: [], prices: [] });
      continue;
    }
    if (!out.length) out.push({ title: "Items", items: [], prices: [] });
    const item = line.replace(/^[-•*]\s*/, "");
    const m = PRICED.exec(item);
    const sec = out[out.length - 1];
    sec.items.push(m && m[1] ? m[1].trim() : item);
    sec.prices!.push(m && m[1] ? { sp: Number(m[2]), mrp: Number(m[3] ?? 0) } : null);
  }
  return out
    .filter((s) => s.title)
    .map((s) => (s.prices!.some(Boolean) ? s : { title: s.title, items: s.items }));
}

/** Total school price and MRP of a kit's priced items (null when none is priced). */
export function itemsTotal(sections: KitSection[]): ItemPrice | null {
  const all = sections.flatMap((s) => s.prices ?? []).filter((p): p is ItemPrice => !!p);
  if (!all.length) return null;
  const r = (n: number) => Math.round(n * 100) / 100;
  return { sp: r(all.reduce((t, p) => t + p.sp, 0)), mrp: r(all.reduce((t, p) => t + p.mrp, 0)) };
}
